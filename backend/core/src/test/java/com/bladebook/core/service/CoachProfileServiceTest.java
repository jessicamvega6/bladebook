package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.domain.BusinessEmails;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.Email;
import com.bladebook.core.domain.LinkToken;
import com.bladebook.core.domain.PaymentTypes.Type;
import com.bladebook.core.service.CoachProfileService.BusinessDetails;
import com.bladebook.core.service.CoachProfileService.Details;
import com.bladebook.core.service.CoachProfileService.Payments;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
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

    private static final Instant START = Instant.parse("2026-11-16T20:15:00Z"); // 2:15 PM in Chicago

    /** A clock the test moves on. */
    static final class TestClock extends Clock {
        Instant now = START;

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }

        void advance(Duration d) { now = now.plus(d); }
    }

    private CoachRepository repo;
    private Deque<CoachCode> queued;
    private CoachProfileService service;
    private AccessContext ctx;
    private LocalOutbox outbox;
    private TestClock clock;
    private int tokens;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        repo = new CoachRepository(f.clients, f.table);
        queued = new ArrayDeque<>();
        clock = new TestClock();
        outbox = new LocalOutbox(clock);
        tokens = 0;
        Supplier<CoachCode> random = CoachProfileService.randomCodes();
        service = new CoachProfileService(repo, () -> queued.isEmpty() ? random.get() : queued.poll(),
                new CoachProfileService.ConfirmationMail(outbox, "https://app.bladebook.test/", clock, () -> "token-" + (++tokens)));
        ctx = new AccessContext(UUID.randomUUID().toString());
    }

    /** The token in the newest confirmation email's link. */
    private String lastToken() {
        String url = (String) outbox.list().get(0).email().data().get("confirmUrl");
        return url.substring(url.lastIndexOf('/') + 1);
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
        assertThat(p.pendingBusinessEmails()).containsOnlyKeys("lessons@dana.com");
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
        assertThat(after.displayPhoneToClients()).isFalse();                   // no phone to show
        assertThat(service.profile(ctx).displayPhoneToClients()).isFalse();
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

    // ---- business email (ADR-016, amended 2026-11-12; architecture.md section 6.13) ----

    @Test
    void signingUpWithADifferentEmailSendsItsConfirmationLink() {
        CoachProfile p = service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));

        assertThat(outbox.list()).hasSize(1);
        Email e = outbox.list().get(0).email();
        assertThat(e.template()).isEqualTo("business-email-confirmation");
        assertThat(e.to()).isEqualTo("lessons@dana.com"); // the new address, not the login email
        assertThat(e.fromName()).isEqualTo("BladeBook");
        assertThat(e.replyTo()).isNull();
        assertThat(e.data()).containsEntry("coachFirst", "Dana").containsEntry("newEmail", "lessons@dana.com")
                .containsEntry("confirmUrl", "https://app.bladebook.test/#/confirm-email/token-1")
                .containsEntry("expiresAt", "Thu, Nov 19 at 2:15 PM"); // 3 days, in the coach's time zone
        // only the token's hash is kept
        assertThat(p.pendingBusinessEmails().get("lessons@dana.com"))
                .isEqualTo(BusinessEmails.Link.sentAt(LinkToken.hash("token-1"), START));
        assertThat(service.profile(ctx).pendingBusinessEmails()).isEqualTo(p.pendingBusinessEmails());
    }

    @Test
    void signingUpWithTheLoginEmailSendsNothing() {
        service.completeSignup(ctx, LOGIN, sameEmail());
        assertThat(outbox.list()).isEmpty();
    }

    @Test
    void confirmingFromTheLinkMakesTheCodeWork() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        clock.advance(Duration.ofDays(2));

        CoachProfileService.Confirmed c = service.confirmBusinessEmail(ctx, lastToken());

        assertThat(c.address()).isEqualTo("lessons@dana.com");
        assertThat(c.profile().businessEmail()).isEqualTo("lessons@dana.com");
        assertThat(c.profile().codeWorks()).isTrue();
        assertThat(c.profile().pendingBusinessEmails()).isEmpty();
        assertThat(service.profile(ctx)).isEqualTo(c.profile());
    }

    @Test
    void aLinkWorksOnce() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        String token = lastToken();
        service.confirmBusinessEmail(ctx, token);

        assertThatThrownBy(() -> service.confirmBusinessEmail(ctx, token))
                .isInstanceOf(DomainException.class).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
        assertThatThrownBy(() -> service.checkBusinessEmailLink(ctx, token)).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
    }

    @Test
    void aLinkStopsWorkingAfterThreeDays() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        String token = lastToken();
        clock.advance(Duration.ofDays(3));

        assertThatThrownBy(() -> service.confirmBusinessEmail(ctx, token))
                .isInstanceOf(DomainException.class)
                .hasMessage(BusinessEmails.LINK_DOESNT_WORK)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
        assertThat(service.profile(ctx).codeWorks()).isFalse();
    }

    @Test
    void resendGivesANewLinkAndTheOldOneStopsWorking() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        String first = lastToken();
        clock.advance(Duration.ofMinutes(5));

        CoachProfile p = service.resendBusinessEmailLink(ctx, "lessons@dana.com");

        assertThat(outbox.list()).hasSize(2);
        String second = lastToken();
        assertThat(second).isNotEqualTo(first);
        assertThat(p.pendingBusinessEmails().get("lessons@dana.com").expiresAt()).isEqualTo(clock.now.plus(Duration.ofDays(3)));
        assertThatThrownBy(() -> service.confirmBusinessEmail(ctx, first)).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
        assertThat(service.confirmBusinessEmail(ctx, second).profile().codeWorks()).isTrue();
    }

    @Test
    void resendRightAwaySendsNothing() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        assertThatThrownBy(() -> service.resendBusinessEmailLink(ctx, "lessons@dana.com"))
                .isInstanceOf(DomainException.class);
        assertThat(outbox.list()).hasSize(1);
    }

    @Test
    void checkingALinkNamesItsAddressAndChangesNothing() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        CoachProfile before = service.profile(ctx);

        assertThat(service.checkBusinessEmailLink(ctx, lastToken())).isEqualTo("lessons@dana.com");
        assertThat(service.profile(ctx)).isEqualTo(before);
        assertThatThrownBy(() -> service.checkBusinessEmailLink(ctx, null)).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
        assertThatThrownBy(() -> service.checkBusinessEmailLink(ctx, "x".repeat(500))).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
    }

    @Test
    void anotherCoachsLinkMatchesNothing() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        String danasToken = lastToken();
        AccessContext sam = new AccessContext(UUID.randomUUID().toString());
        service.completeSignup(sam, "sam@gmail.com", differentEmail("lessons@sam.com"));

        assertThatThrownBy(() -> service.confirmBusinessEmail(sam, danasToken)).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
        assertThat(service.profile(sam).codeWorks()).isFalse();
    }

    @Test
    void changingTheAddressAtSignUpSendsANewLinkAndKillsTheOldOne() {
        service.completeSignup(ctx, LOGIN, differentEmail("lesons@dana.com"));
        String typo = lastToken();

        CoachProfile p = service.addBusinessEmail(ctx, "lessons@dana.com", "lesons@dana.com");

        assertThat(p.pendingBusinessEmails()).containsOnlyKeys("lessons@dana.com");
        assertThat(outbox.list().get(0).email().to()).isEqualTo("lessons@dana.com");
        assertThatThrownBy(() -> service.confirmBusinessEmail(ctx, typo)).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
    }

    @Test
    void onTheProfileANewAddressWaitsAndFamiliesKeepTheCurrentOneUntilItsConfirmed() {
        service.completeSignup(ctx, LOGIN, sameEmail());

        CoachProfile waiting = service.addBusinessEmail(ctx, " club@dana.com ", null);
        assertThat(waiting.businessEmail()).isEqualTo(LOGIN);
        assertThat(waiting.pendingBusinessEmails()).containsOnlyKeys("club@dana.com");
        assertThat(outbox.list().get(0).email().to()).isEqualTo("club@dana.com");

        CoachProfile confirmed = service.confirmBusinessEmail(ctx, lastToken()).profile();
        assertThat(confirmed.businessEmail()).isEqualTo("club@dana.com");
        assertThat(confirmed.coachCode()).isEqualTo(waiting.coachCode()); // the code is untouched

        CoachProfile back = service.chooseBusinessEmail(ctx, LOGIN);
        assertThat(back.businessEmail()).isEqualTo(LOGIN);
        assertThat(service.removeBusinessEmail(ctx, "club@dana.com").confirmedBusinessEmails()).isEmpty();
    }

    @Test
    void aNewAddressMustBeAnEmailAndNotAlreadyListed() {
        service.completeSignup(ctx, LOGIN, sameEmail());
        assertThatThrownBy(() -> service.addBusinessEmail(ctx, "club", null))
                .isInstanceOf(DomainException.class).extracting("field").isEqualTo("address");
        assertThatThrownBy(() -> service.addBusinessEmail(ctx, LOGIN.toUpperCase(), null))
                .isInstanceOf(DomainException.class).hasMessage("That address is already on your list.");
        assertThat(outbox.list()).isEmpty();
    }

    @Test
    void anEmailThatCantBeSentIsSaidSoAndResendStillWorks() {
        CoachProfileService failing = new CoachProfileService(repo, CoachProfileService.randomCodes(),
                new CoachProfileService.ConfirmationMail(e -> { throw new IllegalStateException("SES down"); },
                        "https://app.bladebook.test", clock, () -> "token-x"));
        failing.completeSignup(ctx, LOGIN, sameEmail());

        assertThatThrownBy(() -> failing.addBusinessEmail(ctx, "club@dana.com", null))
                .isInstanceOf(DomainException.class).hasMessageContaining("couldn’t send");
        assertThat(service.profile(ctx).pendingBusinessEmails()).containsOnlyKeys("club@dana.com");
    }

    @Test
    void useMyLoginEmailInsteadMakesTheCodeWork() {
        service.completeSignup(ctx, LOGIN, differentEmail("lessons@dana.com"));
        String token = lastToken();

        CoachProfile p = service.useLoginEmail(ctx);

        assertThat(p.businessEmail()).isEqualTo(LOGIN);
        assertThat(p.codeWorks()).isTrue();
        assertThat(p.pendingBusinessEmails()).containsOnlyKeys("lessons@dana.com"); // still on the list, still confirmable
        assertThat(service.confirmBusinessEmail(ctx, token).profile().businessEmail()).isEqualTo("lessons@dana.com");
    }

    @Test
    void confirmingRetriesATakenCode() {
        CoachProfile dana = service.completeSignup(ctx, LOGIN, sameEmail());
        AccessContext other = new AccessContext(UUID.randomUUID().toString());
        queued.add(dana.coachCode()); // Sam's pending profile is given Dana's code
        service.completeSignup(other, "sam@gmail.com", differentEmail("lessons@sam.com"));
        CoachCode fresh = CoachCode.parse("AAAA-BBBB");
        queued.add(fresh);

        CoachProfile sam = service.confirmBusinessEmail(other, lastToken()).profile();

        assertThat(sam.coachCode()).isEqualTo(fresh);
        assertThat(sam.codeWorks()).isTrue();
    }

    @Test
    void useMyLoginEmailIsOnlyForACodeThatIsntWorking() {
        service.completeSignup(ctx, LOGIN, sameEmail());
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
