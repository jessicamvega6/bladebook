package com.bladebook.core.domain;

import java.time.LocalTime;
import java.util.List;

/**
 * One stored block on one day (ADR-MASTER section 6): lessons back to back from {@code startTime}.
 * Times are the coach's local wall clock. Every block a template makes carries the template's
 * {@code seq}. {@code blockName} is {@code null} when the coach gave none.
 */
public record ScheduleBlock(int seq, String blockName, LocalTime startTime, LocalTime endTime, int lessonMinutes,
                            int priceMinor, int missedLessonFeeMinor, int maxSkaters, IceType iceType) {

    public List<LocalTime> slots() {
        return Slots.expand(startTime, endTime, lessonMinutes);
    }

    /** The name, or {@code Block N} from {@code seq} (ADR-008 decision 2a). */
    public String label() {
        return blockName == null || blockName.isBlank() ? "Block " + seq : blockName.trim();
    }
}
