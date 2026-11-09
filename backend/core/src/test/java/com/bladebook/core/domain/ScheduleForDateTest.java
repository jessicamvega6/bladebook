package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Which schedule applies to a date (ADR-MASTER section 6): an override, an empty override, or the default. */
class ScheduleForDateTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 9);
    private static final LocalDate TUESDAY = LocalDate.of(2026, 11, 10);

    private static ScheduleBlock block(int seq, int startHour, int endHour) {
        return new ScheduleBlock(seq, null, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), 30, 5000, 0, 1, IceType.PUBLIC);
    }

    private static final WeeklySchedule WEEK = new WeeklySchedule(Map.of(DayOfWeek.MONDAY, List.of(block(1, 6, 8))), 3);

    @Test
    void withNoOverrideTheDefaultDayApplies() {
        assertThat(ScheduleForDate.blocks(MONDAY, WEEK, Map.of())).containsExactly(block(1, 6, 8));
    }

    @Test
    void aWeekdayTheDefaultLeavesEmptyHasNoBlocks() {
        assertThat(ScheduleForDate.blocks(TUESDAY, WEEK, Map.of())).isEmpty();
    }

    @Test
    void anOverrideReplacesTheDefault() {
        assertThat(ScheduleForDate.blocks(MONDAY, WEEK, Map.of(MONDAY, List.of(block(1, 9, 12)))))
                .containsExactly(block(1, 9, 12));
    }

    @Test
    void anEmptyOverrideMeansNoLessonsThatDay() {
        assertThat(ScheduleForDate.blocks(MONDAY, WEEK, Map.of(MONDAY, List.of()))).isEmpty();
    }

    @Test
    void anOverrideStartingMidWeekLeavesTheDaysBeforeItAlone() {
        Map<LocalDate, List<ScheduleBlock>> fromTuesday = Map.of(TUESDAY, List.of(block(1, 9, 12)));
        assertThat(ScheduleForDate.blocks(MONDAY, WEEK, fromTuesday)).containsExactly(block(1, 6, 8));
        assertThat(ScheduleForDate.blocks(TUESDAY, WEEK, fromTuesday)).containsExactly(block(1, 9, 12));
    }

    @Test
    void aCoachWithNoScheduleHasNoBlocks() {
        assertThat(ScheduleForDate.blocks(MONDAY, null, Map.of())).isEmpty();
        assertThat(ScheduleForDate.blocks(MONDAY, null, Map.of(MONDAY, List.of(block(1, 9, 12))))).hasSize(1);
    }
}
