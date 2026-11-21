package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FamilyAccountTest {

    @Test
    void itsStandingComesFromItsLinks() {
        FamilyProfile p = new FamilyProfile("sub", "Sarah", "Park", "s@example.com", "2055550196", ClientRelationship.GUARDIAN, Instant.EPOCH);
        FamilyAccount a = new FamilyAccount(p, List.of(),
                List.of(new SkaterLink("dana", "ava", "Ava Park", StudentStatus.PENDING, "Dana", "Whitfield")));

        assertThat(a.standing().waiting()).isTrue();
    }
}
