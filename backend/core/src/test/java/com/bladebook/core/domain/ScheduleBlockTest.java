package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

/** One stored block (ADR-MASTER section 6). */
class ScheduleBlockTest {

    @Test
    void itsSlotsAreBackToBackFromItsStart() {
        ScheduleBlock b = new ScheduleBlock(1, null, LocalTime.of(6, 0), LocalTime.of(7, 30), 45, 5000, 0, 1, IceType.PUBLIC);
        assertThat(b.slots()).containsExactly(LocalTime.of(6, 0), LocalTime.of(6, 45));
    }

    @Test
    void theLabelIsTheNameOrBlockN() {
        assertThat(new ScheduleBlock(2, null, LocalTime.of(6, 0), LocalTime.of(7, 0), 30, 0, 0, 1, IceType.PUBLIC).label()).isEqualTo("Block 2");
        assertThat(new ScheduleBlock(2, "Camp", LocalTime.of(6, 0), LocalTime.of(7, 0), 30, 0, 0, 1, IceType.PUBLIC).label()).isEqualTo("Camp");
    }
}
