package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The one evaluator (ADR-MASTER section 9): compares the lesson times stored with the ones the schedule
 * now makes.
 *
 * <p>Batch 2 plans only what touches no family — adding, removing and updating times nobody has booked,
 * which are "part of the save, not batch lines". A booked time the schedule no longer makes, or makes at
 * a new price, is counted in {@link #bookedNotChanged()} and left alone: cancel and re-price lines come
 * with the save preview (Batch 6). Past times are never touched.
 *
 * <p>Re-pricing follows ADR-020: a decrease reaches every upcoming time, an increase only times starting
 * later than the notice period from now.
 */
public record ScheduleChange(List<LessonTime> add, List<LessonTime> remove, List<LessonTime> replace, int bookedNotChanged) {

    public ScheduleChange {
        add = List.copyOf(add);
        remove = List.copyOf(remove);
        replace = List.copyOf(replace);
    }

    public boolean isEmpty() {
        return add.isEmpty() && remove.isEmpty() && replace.isEmpty();
    }

    public static ScheduleChange plan(List<LessonTime> existing, List<LessonTime> desired, Instant now) {
        Map<String, LessonTime> have = new HashMap<>();
        for (LessonTime t : existing) {
            if (t.startsAtUtc().isAfter(now)) {
                have.put(t.key(), t);
            }
        }
        List<LessonTime> add = new ArrayList<>();
        List<LessonTime> replace = new ArrayList<>();
        int booked = 0;
        Map<String, LessonTime> want = new HashMap<>();
        for (LessonTime d : desired) {
            if (!d.startsAtUtc().isAfter(now)) {
                continue;
            }
            want.put(d.key(), d);
            LessonTime h = have.get(d.key());
            if (h == null) {
                add.add(d);
            } else if (h.lessonStatus() == LessonTime.Status.OPEN) {
                LessonTime next = priced(h, d, now);
                if (!next.sameStamps(h)) {
                    replace.add(next);
                }
            } else if (h.lessonStatus() == LessonTime.Status.BOOKED && !d.sameStamps(h)) {
                booked++;
            }
        }
        List<LessonTime> remove = new ArrayList<>();
        for (LessonTime h : existing) {
            if (!h.startsAtUtc().isAfter(now) || want.containsKey(h.key())) {
                continue;
            }
            if (h.lessonStatus() == LessonTime.Status.BOOKED) {
                booked++;
            } else {
                remove.add(h);
            }
        }
        return new ScheduleChange(add, remove, replace, booked);
    }

    /** {@code wanted}, keeping the old price if it's an increase inside the notice period. */
    private static LessonTime priced(LessonTime had, LessonTime wanted, Instant now) {
        boolean increase = wanted.priceMinor() > had.priceMinor();
        boolean insideNotice = had.startsAtUtc().isBefore(now.plus(Duration.ofHours(had.requiredNoticeHours())));
        return increase && insideNotice ? wanted.withPrice(had.priceMinor()) : wanted;
    }
}
