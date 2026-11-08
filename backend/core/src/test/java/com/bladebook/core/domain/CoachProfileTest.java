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
        assertThat(dana().pendingBusinessEmail("lessons@dana.com").build().codeWorks()).isFalse();
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
