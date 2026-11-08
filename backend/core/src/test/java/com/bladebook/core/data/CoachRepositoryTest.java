package com.bladebook.core.data;

import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.PaymentTypes.Type;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** CoachRepository against DynamoDB Local. */
class CoachRepositoryTest {

    private DynamoDbLocal.Fixture f;
    private CoachRepository repo;
    private AccessContext ctx;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        repo = new CoachRepository(f.clients, f.table);
        ctx = new AccessContext(UUID.randomUUID().toString());
    }

    private CoachProfile.Builder profile(String code) {
        return CoachProfile.builder().coachId(ctx.coachId()).firstName("Dana").lastName("Whitfield")
                .loginEmail("dana@gmail.com").coachTimezone("America/Chicago")
                .currency(CoachProfile.Currency.USD).coachCode(CoachCode.parse(code));
    }

    private Map<String, AttributeValue> raw(String pk, String sk) {
        DynamoDbClient db = f.clients.forSetup();
        return db.getItem(GetItemRequest.builder().tableName(f.table).consistentRead(true)
                .key(Map.of("PK", AttributeValue.fromS(pk), "SK", AttributeValue.fromS(sk))).build()).item();
    }

    private Map<String, AttributeValue> codeItem(String code) {
        return raw("CODE#" + CoachCode.parse(code).value(), "CODE");
    }

    // ---- create ----

    @Test
    void aProfileWithAConfirmedEmailWritesProfileAndCode() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build();
        repo.create(ctx, p);

        assertThat(repo.find(ctx)).contains(p);
        Map<String, AttributeValue> code = codeItem("7K2Q-M9XT");
        assertThat(code.get("coachId").s()).isEqualTo(ctx.coachId());
        assertThat(code.get("coachFirstName").s()).isEqualTo("Dana");
        assertThat(code.get("coachLastName").s()).isEqualTo("Whitfield");
        // only the attributes coach-tenant may write on CODE# (ADR-MASTER section 16)
        assertThat(code.keySet()).containsExactlyInAnyOrder("PK", "SK", "coachId", "coachFirstName", "coachLastName");
    }

    @Test
    void aProfileWaitingForItsBusinessEmailWritesNoCode() {
        CoachProfile p = profile("7K2Q-M9XT").pendingBusinessEmail("lessons@dana.com").build();
        repo.create(ctx, p);

        assertThat(repo.find(ctx)).contains(p);
        assertThat(codeItem("7K2Q-M9XT")).isEmpty();
    }

    @Test
    void theProfileStoresEveryFieldItIsGiven() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").phone("(205) 555-0142")
                .currency(CoachProfile.Currency.CAD).paymentInstructions("Cash at the rink.")
                .payments(PaymentTypes.none().withHandle(Type.VENMO, "@dana").switchOn(Type.VENMO)
                        .withHandle(Type.CASHAPP, "$dana").switchOn(Type.CASH))
                .build();
        repo.create(ctx, p);

        Map<String, AttributeValue> item = raw(ctx.partitionKey(), "PROFILE");
        assertThat(item.get("coachTimezone").s()).isEqualTo("America/Chicago");
        assertThat(item.get("requiredNoticeHours").n()).isEqualTo("24");
        assertThat(item.get("acceptsVenmo").bool()).isTrue();
        assertThat(item.get("acceptsCashapp").bool()).isFalse();
        assertThat(item.get("cashappHandle").s()).isEqualTo("$dana");
        assertThat(item.get("smsCancellationAlerts").bool()).isFalse();
        assertThat(item).doesNotContainKey("profilePhotoKey");
        assertThat(repo.find(ctx)).contains(p);
    }

    @Test
    void aSecondProfileForTheSameCoachIsRefused() {
        repo.create(ctx, profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build());
        assertThatThrownBy(() -> repo.create(ctx, profile("AAAA-BBBB").businessEmail("dana@gmail.com").build()))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
    }

    @Test
    void aTakenCodeIsReportedAndNothingIsWritten() {
        repo.create(ctx, profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        CoachProfile second = CoachProfile.builder().coachId(other.coachId()).firstName("Sam").lastName("Lee")
                .loginEmail("sam@gmail.com").businessEmail("sam@gmail.com").coachTimezone("America/Denver")
                .coachCode(CoachCode.parse("7K2Q-M9XT")).build();

        assertThatThrownBy(() -> repo.create(other, second)).isInstanceOf(CoachRepository.CodeTakenException.class);
        assertThat(repo.find(other)).isEmpty();
        assertThat(codeItem("7K2Q-M9XT").get("coachId").s()).isEqualTo(ctx.coachId());
    }

    @Test
    void findReturnsEmptyForACoachWithNoProfile() {
        assertThat(repo.find(ctx)).isEmpty();
    }

    // ---- details ----

    @Test
    void renamingKeepsTheCodeItemsNameInStep() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build();
        repo.create(ctx, p);

        CoachProfile renamed = p.toBuilder().firstName("Danielle").lastName("Whit").phone("205-555-0142")
                .coachTimezone("America/New_York").build();
        repo.updateDetails(ctx, renamed);

        assertThat(repo.find(ctx)).contains(renamed);
        assertThat(codeItem("7K2Q-M9XT").get("coachFirstName").s()).isEqualTo("Danielle");
        assertThat(codeItem("7K2Q-M9XT").get("coachLastName").s()).isEqualTo("Whit");
    }

    @Test
    void renamingWhileTheCodeIsNotWorkingWritesNoCode() {
        CoachProfile p = profile("7K2Q-M9XT").pendingBusinessEmail("lessons@dana.com").build();
        repo.create(ctx, p);
        repo.updateDetails(ctx, p.toBuilder().firstName("Danielle").build());

        assertThat(repo.find(ctx).orElseThrow().firstName()).isEqualTo("Danielle");
        assertThat(codeItem("7K2Q-M9XT")).isEmpty();
    }

    @Test
    void clearingThePhoneRemovesIt() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").phone("205-555-0142").build();
        repo.create(ctx, p);
        repo.updateDetails(ctx, p.toBuilder().phone(null).build());

        assertThat(raw(ctx.partitionKey(), "PROFILE")).doesNotContainKey("phone");
    }

    @Test
    void updatingDetailsWithNoProfileIsNotFound() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build();
        assertThatThrownBy(() -> repo.updateDetails(ctx, p))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.NOT_FOUND);
    }

    // ---- payments ----

    @Test
    void paymentsAreReplacedAndAKeptHandleSurvivesSwitchingOff() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com")
                .payments(PaymentTypes.none().withHandle(Type.VENMO, "@dana").switchOn(Type.VENMO)).build();
        repo.create(ctx, p);

        PaymentTypes next = p.payments().switchOff(Type.VENMO).switchOn(Type.CASH);
        repo.updatePayments(ctx, "Cash please", next);

        CoachProfile saved = repo.find(ctx).orElseThrow();
        assertThat(saved.payments()).isEqualTo(next);
        assertThat(saved.payments().handle(Type.VENMO)).contains("@dana");
        assertThat(saved.paymentInstructions()).isEqualTo("Cash please");

        repo.updatePayments(ctx, null, PaymentTypes.none());
        assertThat(raw(ctx.partitionKey(), "PROFILE")).doesNotContainKeys("paymentInstructions", "venmoHandle");
    }

    @Test
    void updatingPaymentsWithNoProfileIsNotFound() {
        assertThatThrownBy(() -> repo.updatePayments(ctx, null, PaymentTypes.none()))
                .isInstanceOf(DomainException.class);
    }

    // ---- rotate ----

    @Test
    void rotatingAWorkingCodeRetiresTheOldOneAtOnce() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build();
        repo.create(ctx, p);

        repo.replaceCode(ctx, p, CoachCode.parse("AAAA-BBBB"));

        assertThat(repo.find(ctx).orElseThrow().coachCode()).isEqualTo(CoachCode.parse("AAAA-BBBB"));
        assertThat(codeItem("7K2Q-M9XT")).isEmpty();
        assertThat(codeItem("AAAA-BBBB").get("coachId").s()).isEqualTo(ctx.coachId());
    }

    @Test
    void rotatingANotYetWorkingCodeOnlyChangesTheProfile() {
        CoachProfile p = profile("7K2Q-M9XT").pendingBusinessEmail("lessons@dana.com").build();
        repo.create(ctx, p);

        repo.replaceCode(ctx, p, CoachCode.parse("AAAA-BBBB"));

        assertThat(repo.find(ctx).orElseThrow().coachCode()).isEqualTo(CoachCode.parse("AAAA-BBBB"));
        assertThat(codeItem("AAAA-BBBB")).isEmpty();
    }

    @Test
    void rotatingOntoATakenCodeChangesNothing() {
        repo.create(ctx, profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        CoachProfile sam = CoachProfile.builder().coachId(other.coachId()).firstName("Sam").lastName("Lee")
                .loginEmail("sam@gmail.com").businessEmail("sam@gmail.com").coachTimezone("America/Denver")
                .coachCode(CoachCode.parse("CCCC-DDDD")).build();
        repo.create(other, sam);

        assertThatThrownBy(() -> repo.replaceCode(other, sam, CoachCode.parse("7K2Q-M9XT")))
                .isInstanceOf(CoachRepository.CodeTakenException.class);
        assertThat(codeItem("CCCC-DDDD").get("coachId").s()).isEqualTo(other.coachId());
        assertThat(codeItem("7K2Q-M9XT").get("coachId").s()).isEqualTo(ctx.coachId());
        assertThat(repo.find(other).orElseThrow().coachCode()).isEqualTo(CoachCode.parse("CCCC-DDDD"));
    }

    @Test
    void rotatingFromAStaleProfileIsAConflict() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build();
        repo.create(ctx, p);
        repo.replaceCode(ctx, p, CoachCode.parse("AAAA-BBBB"));

        // p still says 7K2Q-M9XT: a second tab rotating at the same time
        assertThatThrownBy(() -> repo.replaceCode(ctx, p, CoachCode.parse("CCCC-DDDD")))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
        assertThat(codeItem("AAAA-BBBB")).isNotEmpty();
        assertThat(codeItem("CCCC-DDDD")).isEmpty();
    }

    // ---- business email ----

    @Test
    void activatingTheBusinessEmailWritesTheCode() {
        CoachProfile p = profile("7K2Q-M9XT").pendingBusinessEmail("lessons@dana.com").build();
        repo.create(ctx, p);

        repo.activateBusinessEmail(ctx, p, "lessons@dana.com", CoachCode.parse("7K2Q-M9XT"));

        CoachProfile saved = repo.find(ctx).orElseThrow();
        assertThat(saved.businessEmail()).isEqualTo("lessons@dana.com");
        assertThat(saved.pendingBusinessEmail()).isNull();
        assertThat(saved.codeWorks()).isTrue();
        assertThat(codeItem("7K2Q-M9XT").get("coachId").s()).isEqualTo(ctx.coachId());
    }

    @Test
    void activatingWithANewCodeStoresThatCode() {
        CoachProfile p = profile("7K2Q-M9XT").pendingBusinessEmail("lessons@dana.com").build();
        repo.create(ctx, p);

        repo.activateBusinessEmail(ctx, p, "dana@gmail.com", CoachCode.parse("AAAA-BBBB"));

        assertThat(repo.find(ctx).orElseThrow().coachCode()).isEqualTo(CoachCode.parse("AAAA-BBBB"));
        assertThat(codeItem("AAAA-BBBB")).isNotEmpty();
        assertThat(codeItem("7K2Q-M9XT")).isEmpty();
    }

    @Test
    void activatingTwiceIsAConflict() {
        CoachProfile p = profile("7K2Q-M9XT").pendingBusinessEmail("lessons@dana.com").build();
        repo.create(ctx, p);
        repo.activateBusinessEmail(ctx, p, "lessons@dana.com", CoachCode.parse("7K2Q-M9XT"));

        assertThatThrownBy(() -> repo.activateBusinessEmail(ctx, p, "dana@gmail.com", CoachCode.parse("AAAA-BBBB")))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
        assertThat(codeItem("AAAA-BBBB")).isEmpty();
    }

    @Test
    void activatingOntoATakenCodeChangesNothing() {
        repo.create(ctx, profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        CoachProfile sam = CoachProfile.builder().coachId(other.coachId()).firstName("Sam").lastName("Lee")
                .loginEmail("sam@gmail.com").pendingBusinessEmail("lessons@sam.com").coachTimezone("America/Denver")
                .coachCode(CoachCode.parse("7K2Q-M9XT")).build();
        repo.create(other, sam);

        assertThatThrownBy(() -> repo.activateBusinessEmail(other, sam, "lessons@sam.com", CoachCode.parse("7K2Q-M9XT")))
                .isInstanceOf(CoachRepository.CodeTakenException.class);
        assertThat(repo.find(other).orElseThrow().codeWorks()).isFalse();
    }

    // ---- isolation in code ----

    @Test
    void oneCoachCantReadAnothersProfile() {
        repo.create(ctx, profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build());
        assertThat(repo.find(new AccessContext(UUID.randomUUID().toString()))).isEmpty();
    }

    @Test
    void theProfileMustBelongToTheCaller() {
        CoachProfile p = profile("7K2Q-M9XT").businessEmail("dana@gmail.com").build();
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        assertThatThrownBy(() -> repo.create(other, p)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> repo.updateDetails(other, p)).isInstanceOf(IllegalArgumentException.class);
    }
}
