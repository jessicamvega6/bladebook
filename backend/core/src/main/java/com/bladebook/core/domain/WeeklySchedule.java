package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The default schedule, {@code COACH#<coachId> / SCHEDULE#DEFAULT} (ADR-MASTER section 6): each
 * weekday's blocks, in time order. {@code scheduleVersion} goes up on every save.
 */
public record WeeklySchedule(Map<DayOfWeek, List<ScheduleBlock>> days, long scheduleVersion) {

    public WeeklySchedule {
        Map<DayOfWeek, List<ScheduleBlock>> d = new EnumMap<>(DayOfWeek.class);
        if (days != null) {
            days.forEach((day, blocks) -> {
                if (blocks != null && !blocks.isEmpty()) {
                    d.put(day, List.copyOf(blocks));
                }
            });
        }
        days = Map.copyOf(d);
    }

    public List<ScheduleBlock> blocksOn(DayOfWeek day) {
        return days.getOrDefault(day, List.of());
    }

    /** No block on any day. */
    public boolean isEmpty() {
        return days.isEmpty();
    }
}
