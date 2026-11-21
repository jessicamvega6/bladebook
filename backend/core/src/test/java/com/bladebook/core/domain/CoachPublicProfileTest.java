package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class CoachPublicProfileTest {

    @Test
    void phoneAndEmailShowOnlyWhenTheCoachSaysSo() {
        PaymentTypes none = PaymentTypes.of(Set.of(), Map.of());
        CoachPublicProfile hidden = new CoachPublicProfile("Dana", "Whitfield", "2055550142", "dana@ice.com", false, false, none);
        CoachPublicProfile shown = new CoachPublicProfile("Dana", "Whitfield", "2055550142", "dana@ice.com", true, true, none);

        assertThat(hidden.shownPhone()).isNull();
        assertThat(hidden.shownEmail()).isNull();
        assertThat(shown.shownPhone()).isEqualTo("2055550142");
        assertThat(shown.shownEmail()).isEqualTo("dana@ice.com");
    }
}
