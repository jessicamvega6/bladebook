package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** One checked skater and the coaches they join. */
class NewSkaterTest {

    @Test
    void itsCoachesAreACopy() {
        List<CoachCode> codes = new ArrayList<>(List.of(CoachCode.parse("7K2QM9XT")));
        NewSkater s = new NewSkater("Ava Park", true, SkatingOrg.USFS, "1234567", codes);
        codes.clear();
        assertThat(s.coachCodes()).hasSize(1);
    }
}
