package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A family's link item: one skater with one coach. */
class SkaterLinkTest {

    @Test
    void holdsTheSkatersStatusWithOneCoach() {
        SkaterLink l = new SkaterLink("dana", "ava", "Ava Park", StudentStatus.PENDING, "Dana", "Whitfield");
        assertThat(l.status()).isEqualTo(StudentStatus.PENDING);
        assertThat(l.coachFirstName()).isEqualTo("Dana");
    }
}
