package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * One block as the coach edits it, a "tab" in ADR-008 decision 3: one start, end, length, price,
 * skaters per lesson and ice type, the days it runs, and the slots switched off on each day. Each
 * contiguous run of slots left on becomes one stored {@link ScheduleBlock} (decision 4).
 *
 * <p>Any field may be blank ({@code null}) while the coach is editing; {@link ScheduleRules#problems}
 * says what's missing. A blank {@code endTime} means the slots run to 7:00 PM.
 */
public record BlockTemplate(int seq, String name, LocalTime startTime, LocalTime endTime, Integer lessonMinutes,
                            Integer priceMinor, Integer maxSkaters, IceType iceType,
                            Set<DayOfWeek> days, Map<DayOfWeek, Set<LocalTime>> off) {

    public BlockTemplate {
        name = name == null ? "" : name;
        days = days == null || days.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(days));
        Map<DayOfWeek, Set<LocalTime>> o = new EnumMap<>(DayOfWeek.class);
        if (off != null) {
            off.forEach((d, times) -> {
                if (times != null && !times.isEmpty()) {
                    o.put(d, Set.copyOf(times));
                }
            });
        }
        off = Map.copyOf(o);
    }

    /** The name, or {@code Block N} from {@code seq} (ADR-008 decision 2a). */
    public String label() {
        return name.isBlank() ? "Block " + seq : name.trim();
    }

    /** The end the slots run to: the end, or 7:00 PM when it's blank. */
    public LocalTime effectiveEnd() {
        return endTime == null ? Slots.DEFAULT_END : endTime;
    }

    boolean isOff(DayOfWeek day, LocalTime slot) {
        Set<LocalTime> o = off.get(day);
        return o != null && o.contains(slot);
    }
}
