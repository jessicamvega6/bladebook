package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SkaterTest {

    @Test
    void holdsTheNumberWithItsOrganisation() {
        Skater s = new Skater("ava", "Ava Park", true, SkatingOrg.USFS, "1234567");
        assertThat(s.skatingOrg()).isEqualTo(SkatingOrg.USFS);
        assertThat(s.isMinor()).isTrue();
    }
}
