package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.PaymentTypes.Type;
import com.bladebook.core.service.CoachProfileService.BusinessDetails;
import com.bladebook.core.service.CoachProfileService.Details;
import com.bladebook.core.service.CoachProfileService.Payments;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The business-details step, Profile → Details and Payments, and the coach code (ADR-016). */
class CoachProfileServiceTest {

    private static final String LOGIN = "dana.whitfield@gmail.com";

    private CoachRepository repo;
    private Deque<CoachCode> queued;
    private CoachProfileService service;
    private AccessContext ctx;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        repo = new CoachRepository(f.clients, f.table);
        queued = new ArrayDeque<>();
        Supplier<CoachCode> random = CoachProfileService.randomCodes();
        service = new CoachProfileService(repo, () -> queued.isEmpty() ? random.get() : queued.poll());
        ctx = new AccessContext(UUID.randomUUID().toString());
    }

    private static BusinessDetails sameEmail() {
        return new BusinessDetails("Dana", "Whitfield", true, null, "(205) 555-0142", "America/Chicago", "USD",
                new Payments("Venmo or cash at the rink.", EnumSet.of(Type.CASH, Type.VENMO),
                Map.of(Type.VENMO, "@dana-skates")));
    }

    private static BusinessDetails differentEmail(String address) {
        return new BusinessDetails("Dana", "Whitfield", false, address, null, "America/Chicago", "CAD",
                new Payments(null, EnumSet.noneOf(Type.class), Map.of()));
    }

    // ---- business details: login email ----

    @Test
    void withTheLoginEmailTheCodeWorksAtOnce() {
        CoachProfile p = service.completeSignup(ctx, LOGIN, sameEmail());

        assertThat(p.businessEmail()).isEqualTo(LOGIN);
        assertThat(p.pendingBusinessEmail()).isNull();
        assertThat(p.codeWorks()).isTrue();
        assertThat(p.payments().isOn(Type.VENMO)).isTrue();
        assertThat(p.paymentInstructions()).isEqualTo("Venmo or cash at the rink.");
        assertThat(p.phone()).isEqualTo("(205) 555-0142");
        assertThat(service.profile(ctx)).isEqualTo(p);
    }

    @Test
    void typingTheLoginEmailAsTheDifferentEmailCountsAsTheLoginEmail() {
        CoachProfile p = service.completeSignup(ctx, LOGIN, differentEmail("Dana.Whitfield@Gmail.com"));
        assertThat(p.businessEmail()).isEqualTo(LOGIN);
        assertThat(p.codeWorks()).isTrue();
    }

    // ---- business details: different email ----

    @Test
    void withADifferentEmailTheCodeWaitsForTheLink() {
        CoachProfile p = service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));

        assertThat(p.businessEmail()).isNull(); // the login email is not a fallback
        assertThat(p.pendingBusinessEmail()).isEqualTo("lessons@dana.com");
        assertThat(p.codeWorks()).isFalse();
        assertThat(p.currency()).isEqualTo(CoachProfile.Currency.CAD);
        assertThat(p.coachCode()).isNotNull();
    }

    @Test
    void aDifferentEmailMustBeAnEmail() {
        assertThatThrownBy(() -> service.completeSignup(ctx, LOGIN, differentEmail("lessons")))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("businessEmail");
    }

    // ---- business details: checks ----

    @Test
    void signingUpTwiceIsRefused() {
        service.completeSignup(ctx, LOGIN, sameEmail());
        assertThatThrownBy(() -> service.completeSignup(ctx, LOGIN, sameEmail()))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
    }

    @Test
    void everyFieldIsCheckedBeforeAnythingIsWritten() {
        BusinessDetails noTimezone = new BusinessDetails("Dana", "Whitfield", true, null, null, "Mars/Base", "USD",
                new Payments(null, EnumSet.noneOf(Type.class), Map.of()));
        assertThatThrownBy(() -> service.completeSignup(ctx, LOGIN, noTimezone)).isInstanceOf(DomainException.class);

        BusinessDetails venmoNoHandle = new BusinessDetails("Dana", "Whitfield", true, null, null, "America/Chicago",
                "USD", new Payments(null, EnumSet.of(Type.VENMO), Map.of()));
        assertThatThrownBy(() -> service.completeSignup(ctx, LOGIN, venmoNoHandle))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("venmoHandle");

        assertThat(repo.find(ctx)).isEmpty();
    }

    @Test
    void theLoginEmailComesFromTheTokenAndMustBeValid() {
        assertThatThrownBy(() -> service.completeSignup(ctx, "not-an-email", sameEmail()))
                .isInstanceOf(DomainException.class);
    }

    // ---- collision retry ----

    @Test
    void aTakenCodeIsRetriedWithANewOne() {
        CoachProfile first = service.completeSignup(ctx, LOGIN, sameEmail());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        CoachCode fresh = CoachCode.parse("AAAA-BBBB");
        queued.addAll(List.of(first.coachCode(), first.coachCode(), fresh));

        CoachProfile second = service.completeSignup(other, "sam@gmail.com", sameEmail());

        assertThat(second.coachCode()).isEqualTo(fresh);
        assertThat(queued).isEmpty();
    }

    @Test
    void retryingGivesUpAfterFiveTakenCodes() {
        CoachProfile first = service.completeSignup(ctx, LOGIN, sameEmail());
        for (int i = 0; i < CoachProfileService.CODE_ATTEMPTS; i++) {
            queued.add(first.coachCode());
        }
        AccessContext other = new AccessContext(UUID.randomUUID().toString());

        assertThatThrownBy(() -> service.completeSignup(other, "sam@gmail.com", sameEmail()))
                .isInstanceOf(IllegalStateException.class);
        assertThat(repo.find(other)).isEmpty();
    }

    // ---- profile ----

    @Test
    void aCoachWithNoProfileIsNotFound() {
        assertThatThrownBy(() -> service.profile(ctx))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.NOT_FOUND);
    }

    // ---- details ----

    @Test
    void detailsUpdateNamesPhoneAndTimeZoneOnly() {
        CoachProfile before = service.completeSignup(ctx, LOGIN, sameEmail());

        CoachProfile after = service.updateDetails(ctx, new Details(" Danielle ", "Whitfield", "", "America/Toronto"));

        assertThat(after.firstName()).isEqualTo("Danielle");
        assertThat(after.phone()).isNull();
        assertThat(after.coachTimezone()).isEqualTo("America/Toronto");
        assertThat(after.currency()).isEqualTo(before.currency());
        assertThat(after.coachCode()).isEqualTo(before.coachCode());
        assertThat(after.payments()).isEqualTo(before.payments());
    }

    @Test
    void badDetailsChangeNothing() {
        CoachProfile before = service.completeSignup(ctx, LOGIN, sameEmail());
        assertThatThrownBy(() -> service.updateDetails(ctx, new Details("", "Whitfield", null, "America/Chicago")))
                .isInstanceOf(DomainException.class);
        assertThat(service.profile(ctx)).isEqualTo(before);
    }

    // ---- payments ----

    @Test
    void paymentsAreSavedWhole() {
        service.completeSignup(ctx, LOGIN, sameEmail());

        CoachProfile after = service.updatePayments(ctx, new Payments("Interac e-transfer", EnumSet.of(Type.PAYPAL),
                Map.of(Type.PAYPAL, "paypal.me/dana", Type.VENMO, "@dana-skates")));

        assertThat(after.paymentInstructions()).isEqualTo("Interac e-transfer");
        assertThat(after.payments().isOn(Type.PAYPAL)).isTrue();
        assertThat(after.payments().isOn(Type.VENMO)).isFalse();
        assertThat(after.payments().handle(Type.VENMO)).contains("@dana-skates"); // switched off, handle kept
        assertThat(after.payments().isOn(Type.CASH)).isFalse();
    }

    @Test
    void switchingOnWithoutAHandleIsRefused() {
        service.completeSignup(ctx, LOGIN, sameEmail());
        assertThatThrownBy(() -> service.updatePayments(ctx, new Payments(null, EnumSet.of(Type.CASHAPP), Map.of())))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("cashappHandle");
    }

    // ---- rotate ----

    @Test
    void rotatingGivesANewCode() {
        CoachProfile before = service.completeSignup(ctx, LOGIN, sameEmail());
        CoachProfile after = service.rotateCode(ctx);
        assertThat(after.coachCode()).isNotEqualTo(before.coachCode());
        assertThat(service.profile(ctx).coachCode()).isEqualTo(after.coachCode());
    }

    @Test
    void rotatingRetriesATakenCode() {
        CoachProfile dana = service.completeSignup(ctx, LOGIN, sameEmail());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        service.completeSignup(other, "sam@gmail.com", sameEmail());
        CoachCode fresh = CoachCode.parse("AAAA-BBBB");
        queued.addAll(List.of(dana.coachCode(), fresh));

        assertThat(service.rotateCode(other).coachCode()).isEqualTo(fresh);
    }

    @Test
    void rotatingNeverLandsOnTheSameCode() {
        CoachProfile dana = service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        CoachCode fresh = CoachCode.parse("AAAA-BBBB");
        queued.addAll(List.of(dana.coachCode(), fresh));

        assertThat(service.rotateCode(ctx).coachCode()).isEqualTo(fresh);
    }

    // ---- business email ----

    @Test
    void useMyLoginEmailInsteadMakesTheCodeWork() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));

        CoachProfile p = service.useLoginEmail(ctx);

        assertThat(p.businessEmail()).isEqualTo(LOGIN);
        assertThat(p.pendingBusinessEmail()).isNull();
        assertThat(p.codeWorks()).isTrue();
    }

    @Test
    void markingThePendingEmailConfirmedMakesTheCodeWork() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));

        CoachProfile p = service.confirmPendingBusinessEmail(ctx);

        assertThat(p.businessEmail()).isEqualTo("lessons@dana.com");
        assertThat(p.codeWorks()).isTrue();
    }

    @Test
    void confirmingRetriesATakenCode() {
        CoachProfile dana = service.completeSignup(ctx, LOGIN, sameEmail());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        queued.add(dana.coachCode()); // Sam's pending profile is given Dana's code
        service.completeSignup(other, "sam@gmail.com", differentEmail("lessons@sam.com"));
        CoachCode fresh = CoachCode.parse("AAAA-BBBB");
        queued.add(fresh);

        CoachProfile sam = service.confirmPendingBusinessEmail(other);

        assertThat(sam.coachCode()).isEqualTo(fresh);
        assertThat(sam.codeWorks()).isTrue();
    }

    @Test
    void thereIsNothingToConfirmOnceTheCodeWorks() {
        service.completeSignup(ctx, LOGIN, sameEmail());
        assertThatThrownBy(() -> service.confirmPendingBusinessEmail(ctx))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
        assertThatThrownBy(() -> service.useLoginEmail(ctx))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
    }

    // ---- visibility (Profile → Visibility & texts; ADR-MASTER section 4, "What families see"; A3) ----

    @Test
    void bothContactSwitchesStartOffAndAreSavedAndReadBack() {
        CoachProfile start = service.completeSignup(ctx, LOGIN, sameEmail());
        assertThat(start.displayPhoneToClients()).isFalse();
        assertThat(start.displayEmailToClients()).isFalse();

        CoachProfile after = service.updateVisibility(ctx, true, true);

        assertThat(after.displayPhoneToClients()).isTrue();
        assertThat(after.displayEmailToClients()).isTrue();
        assertThat(service.profile(ctx).displayPhoneToClients()).isTrue();
        assertThat(service.updateVisibility(ctx, false, true).displayPhoneToClients()).isFalse();
        assertThat(service.profile(ctx).displayEmailToClients()).isTrue();
    }

    @Test
    void showingAPhoneOrEmailThatIsntThereIsRefused() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com")); // no phone; the email waits for its link
        assertThatThrownBy(() -> service.updateVisibility(ctx, true, false))
                .isInstanceOf(DomainException.class).hasMessage("Add your phone number under Details first.")
                .extracting("field").isEqualTo("showPhone");
        assertThatThrownBy(() -> service.updateVisibility(ctx, false, true))
                .isInstanceOf(DomainException.class).hasMessage("Your business email isn’t confirmed yet. Use the link we emailed you first.")
                .extracting("field").isEqualTo("showEmail");
        assertThat(service.updateVisibility(ctx, false, false).displayPhoneToClients()).isFalse();
    }
}
