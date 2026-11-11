package com.bladebook.core.domain;

import com.bladebook.core.domain.RegistrationRequest.SkaterRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The sign-up as sent: codes, never coach IDs. */
class RegistrationRequestTest {

    @Test
    void carriesCodesNotCoachIds() {
        RegistrationRequest r = new RegistrationRequest("Sarah", "Park", "2055550196", "GUARDIAN", List.of("7K2Q-M9XT"),
                List.of(new SkaterRequest("Ava Park", "USFS", "1234567", List.of("7K2Q-M9XT"))));
        assertThat(r.skaters().get(0).coachCodes()).containsExactly("7K2Q-M9XT");
    }
}
