package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A checked sign-up can't be changed after the checks. */
class RegistrationTest {

    @Test
    void itsListsAreCopiesThatCantBeChanged() {
        List<CoachCode> codes = new ArrayList<>(List.of(CoachCode.parse("7K2QM9XT")));
        Registration r = new Registration("Sarah", "Park", "2055550196", ClientRelationship.GUARDIAN, codes, List.of());
        codes.clear();
        assertThat(r.coachCodes()).hasSize(1);
        assertThatThrownBy(() -> r.skaters().add(null)).isInstanceOf(UnsupportedOperationException.class);
    }
}
