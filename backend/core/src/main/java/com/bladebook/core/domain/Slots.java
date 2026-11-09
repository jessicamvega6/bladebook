package com.bladebook.core.domain;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Back-to-back lesson slots (ADR-008 decision 4, ADR-MASTER section 6). Shared with the website's
 * {@code web/src/shared/logic/schedule.ts}; both pass {@code schedule-cases.json}.
 */
public final class Slots {

    /** Where the slots run to when a block's end is blank (ADR-008 decision 4). */
    public static final LocalTime DEFAULT_END = LocalTime.of(19, 0);
    /** The slot length while a block's lesson length is blank. */
    public static final int DEFAULT_MINUTES = 30;

    private Slots() {
    }

    /**
     * The start of every slot from {@code start}, {@code minutes} apart, that ends by {@code end}. A blank
     * end runs to 7:00 PM, a blank length gives 30-minute slots, a blank start gives none. Any remainder
     * is dropped.
     */
    public static List<LocalTime> expand(LocalTime start, LocalTime end, Integer minutes) {
        if (start == null) {
            return Collections.emptyList();
        }
        int len = minutes == null || minutes <= 0 ? DEFAULT_MINUTES : minutes;
        int to = minutes(end == null ? DEFAULT_END : end);
        List<LocalTime> out = new ArrayList<>();
        for (int t = minutes(start); t + len <= to; t += len) {
            out.add(time(t));
        }
        return out;
    }

    /** Minutes since midnight. */
    public static int minutes(LocalTime t) {
        return t.getHour() * 60 + t.getMinute();
    }

    /** The time {@code m} minutes after midnight, within one day. */
    public static LocalTime time(int m) {
        return LocalTime.of(m / 60, m % 60);
    }
}
