package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Who an email is from and where replies go (ADR-016 d8; ADR-MASTER section 13). */
class EmailTest {

    private static CoachProfile.Builder dana() {
        return CoachProfile.builder().coachId("c1").firstName("Dana").lastName("Whitfield").loginEmail("dana.whitfield@gmail.com")
                .coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD).coachCode(CoachCode.parse("7K2Q-M9XT"));
    }

    @Test
    void aFamilyEmailComesFromTheCoachAndRepliesGoToTheBusinessEmail() {
        Email e = Email.toFamily("booking-confirmation", "grace@example.com", dana().businessEmail("dana@whitfieldskating.com").build(), Map.of());
        assertThat(e.fromName()).isEqualTo("Dana Whitfield via BladeBook");
        assertThat(e.replyTo()).isEqualTo("dana@whitfieldskating.com");
    }

    @Test
    void aCoachUsingTheLoginEmailGetsRepliesThere() {
        Email e = Email.toFamily("booking-confirmation", "grace@example.com", dana().build(), Map.of());
        assertThat(e.replyTo()).isEqualTo("dana.whitfield@gmail.com");
    }

    @Test
    void aCoachEmailGoesToTheLoginEmailWithNoReplyTo() {
        Email e = Email.toCoach("coach-morning", dana().businessEmail("dana@whitfieldskating.com").build(), Map.of("lessonCount", "2"));
        assertThat(e.to()).isEqualTo("dana.whitfield@gmail.com");
        assertThat(e.fromName()).isEqualTo("BladeBook");
        assertThat(e.replyTo()).isNull();
        assertThat(e.data()).containsEntry("lessonCount", "2");
    }

    @Test
    void anEmailNeedsATemplateAndARecipient() {
        assertThatThrownBy(() -> new Email(null, "a@b.c", "BladeBook", null, Map.of())).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new Email("x", null, "BladeBook", null, Map.of())).isInstanceOf(NullPointerException.class);
    }
}
