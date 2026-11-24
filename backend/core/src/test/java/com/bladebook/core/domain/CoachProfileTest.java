package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CoachProfileTest {

    static CoachProfile.Builder dana() {
        return CoachProfile.builder()
                .coachId("sub-1").firstName("Dana").lastName("Whitfield").loginEmail("dana@gmail.com")
                .coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD)
                .coachCode(CoachCode.parse("7K2Q-M9XT"));
    }

    @Test
    void theCodeWorksOnlyOnceThereIsAConfirmedBusinessEmail() {
        assertThat(dana().businessEmail("dana@gmail.com").build().codeWorks()).isTrue();
        assertThat(dana().pendingBusinessEmails(java.util.Map.of("lessons@dana.com", com.bladebook.core.domain.BusinessEmails.Link.none())).build().codeWorks()).isFalse();
    }

    @Test
    void theBusinessEmailListReadsAndWritesThroughTheProfile() {
        java.time.Instant now = java.time.Instant.parse("2026-11-16T14:00:00Z");
        CoachProfile p = dana().businessEmail("dana@gmail.com").build();
        BusinessEmails next = p.businessEmails().add("lessons@dana.com", BusinessEmails.Link.sentAt(LinkToken.hash("t"), now));

        CoachProfile after = p.toBuilder().businessEmails(next).build();

        assertThat(after.businessEmail()).isEqualTo("dana@gmail.com");
        assertThat(after.pendingBusinessEmails()).containsOnlyKeys("lessons@dana.com");
        assertThat(after.pendingBusinessEmail()).isEqualTo("lessons@dana.com");
        assertThat(after.businessEmails().login()).isEqualTo("dana@gmail.com");
        assertThat(after).isNotEqualTo(p);
        assertThat(p.pendingBusinessEmail()).isNull();
    }

    @Test
    void noticeIsNeverShorterThan24Hours() {
        // Owner, 2026-11-23: 24 hours is the minimum; a coach may raise it (Phase 2) but never go below it.
        assertThat(dana().requiredNoticeHours(48).build().requiredNoticeHours()).isEqualTo(48);
        assertThatThrownBy(() -> dana().requiredNoticeHours(23).build()).hasMessage("Notice must be at least 24 hours.");
        assertThatThrownBy(() -> dana().requiredNoticeHours(0).build()).hasMessage("Notice must be at least 24 hours.");
    }

    @Test
    void defaultsMatchTheAdr() {
        CoachProfile p = dana().businessEmail("dana@gmail.com").build();
        assertThat(p.requiredNoticeHours()).isEqualTo(24);
        assertThat(p.payments()).isEqualTo(PaymentTypes.none());
        assertThat(p.displayPhoneToClients()).isFalse();
        assertThat(p.displayEmailToClients()).isFalse();
        assertThat(p.smsCancellationAlerts()).isFalse();
    }

    @Test
    void initialsComeFromTheNames() {
        assertThat(dana().businessEmail("dana@gmail.com").build().initials()).isEqualTo("DW");
    }

    @Test
    void theRequiredFieldsMustBeSet() {
        assertThatThrownBy(() -> dana().coachId(null).build()).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> dana().coachCode(null).build()).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> dana().coachTimezone(null).build()).isInstanceOf(NullPointerException.class);
    }

    @Test
    void toBuilderCopiesEveryField() {
        CoachProfile p = dana().businessEmail("dana@gmail.com").phone("205-555-0142").paymentInstructions("Cash")
                .payments(PaymentTypes.none().switchOn(PaymentTypes.Type.CASH)).build();
        assertThat(p.toBuilder().build()).isEqualTo(p);
    }
}
