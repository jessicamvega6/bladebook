package com.bladebook.core.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Which schedule applies to a date (ADR-MASTER section 6). */
public final class ScheduleForDate {

    private ScheduleForDate() {
    }

    /**
     * A date override's blocks if there is one (an empty list means no lessons that day); otherwise the
     * default schedule's blocks for that weekday.
     *
     * @param weekly the default schedule, or {@code null} if the coach hasn't made one
     * @param overrides the {@code SCHEDULE#DATE#} items, by date
     */
    public static List<ScheduleBlock> blocks(LocalDate date, WeeklySchedule weekly, Map<LocalDate, List<ScheduleBlock>> overrides) {
        List<ScheduleBlock> override = overrides.get(date);
        if (override != null) {
            return override;
        }
        return weekly == null ? List.of() : weekly.blocksOn(date.getDayOfWeek());
    }
}
