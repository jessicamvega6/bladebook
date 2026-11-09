package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The default schedule (ADR-MASTER section 6). */
class WeeklyScheduleTest {

    @Test
    void aDayWithNoBlocksIsEmptyAndTheMapIsCopied() {
        List<ScheduleBlock> monday = new ArrayList<>();
        monday.add(new ScheduleBlock(1, null, LocalTime.of(6, 0), LocalTime.of(7, 0), 30, 0, 0, 1, IceType.PUBLIC));
        Map<DayOfWeek, List<ScheduleBlock>> days = new HashMap<>();
        days.put(DayOfWeek.MONDAY, monday);
        WeeklySchedule w = new WeeklySchedule(days, 1);
        monday.clear();

        assertThat(w.blocksOn(DayOfWeek.MONDAY)).hasSize(1);
        assertThat(w.blocksOn(DayOfWeek.TUESDAY)).isEmpty();
        assertThat(w.isEmpty()).isFalse();
        assertThat(new WeeklySchedule(Map.of(DayOfWeek.MONDAY, List.of()), 1).isEmpty()).isTrue();
    }
}
