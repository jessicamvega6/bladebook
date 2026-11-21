package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class FamilyProfileTest {

    @Test
    void coachesSeeTheFullName() {
        FamilyProfile p = new FamilyProfile("sub", "Sarah", "Park", "sarah@example.com", "2055550196",
                ClientRelationship.GUARDIAN, Instant.EPOCH);
        assertThat(p.fullName()).isEqualTo("Sarah Park");
    }
}
