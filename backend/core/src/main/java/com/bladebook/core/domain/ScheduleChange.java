package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The one evaluator (ADR-MASTER section 9): compares the lesson times stored with the ones the schedule makes, for
 * the preview and the save alike. Past times are never touched.
 *
 * <ul>
 *   <li><b>Open and held times</b> are part of the save, not batch lines: {@code add} what the schedule now makes,
 *       {@code remove} open or held times it no longer makes, {@code replace} open times whose stamps changed.</li>
 *   <li><b>Booked times</b>: {@code cancel} one the schedule no longer makes, or makes with a new length (the new
 *       time then takes its place); {@code reprice} one whose block's price changed. A lesson is never both.</li>
 *   <li><b>Re-pricing</b> (ADR-020): a decrease reaches every upcoming time; an increase only times starting later
 *       than the notice period from now. A booked increase it doesn't reach is listed in {@code kept}.</li>
 *   <li>A booked time whose ice type or skaters per lesson changed is left alone (owner, 2026-11-12).</li>
 * </ul>
 */
public record ScheduleChange(List<LessonTime> add, List<LessonTime> remove, List<LessonTime> replace,
                             List<Cancel> cancel, List<Reprice> reprice, List<Reprice> kept) {

    /** A booked time to cancel; {@code replacement} is the open time the schedule now makes at its key, if any. */
    public record Cancel(LessonTime time, LessonTime replacement) {
    }

    /** A booked time, as stored, and the price the schedule now gives it. */
    public record Reprice(LessonTime time, int newPriceMinor) {

        public boolean increase() {
            return newPriceMinor > time.priceMinor();
        }
    }

    public ScheduleChange {
        add = List.copyOf(add);
        remove = List.copyOf(remove);
        replace = List.copyOf(replace);
        cancel = List.copyOf(cancel);
        reprice = List.copyOf(reprice);
        kept = List.copyOf(kept);
    }

    /** Open-time writes only, with nothing booked touched. */
    public ScheduleChange(List<LessonTime> add, List<LessonTime> remove, List<LessonTime> replace) {
        this(add, remove, replace, List.of(), List.of(), List.of());
    }

    /** No open time to add, remove or replace. */
    public boolean isEmpty() {
        return add.isEmpty() && remove.isEmpty() && replace.isEmpty();
    }

    /** Something booked is cancelled or re-priced: the save writes a change batch. */
    public boolean touchesBookings() {
        return !cancel.isEmpty() || !reprice.isEmpty();
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
        List<Cancel> cancel = new ArrayList<>();
        List<Reprice> reprice = new ArrayList<>();
        List<Reprice> kept = new ArrayList<>();
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
            } else if (h.lessonStatus() == LessonTime.Status.BOOKED) {
                if (h.durationMinutes() != d.durationMinutes() || !h.startsAtUtc().equals(d.startsAtUtc())) {
                    cancel.add(new Cancel(h, d));
                } else if (d.priceMinor() != h.priceMinor()) {
                    Reprice r = new Reprice(h, d.priceMinor());
                    (r.increase() && insideNotice(h, now) ? kept : reprice).add(r);
                }
            }
        }
        List<LessonTime> remove = new ArrayList<>();
        for (LessonTime h : existing) {
            if (!h.startsAtUtc().isAfter(now) || want.containsKey(h.key())) {
                continue;
            }
            if (h.lessonStatus() == LessonTime.Status.BOOKED) {
                cancel.add(new Cancel(h, null));
            } else {
                remove.add(h);
            }
        }
        return new ScheduleChange(add, remove, replace, cancel, reprice, kept);
    }

    /** Starts no later than the notice period from now: a price increase doesn't reach it. */
    static boolean insideNotice(LessonTime t, Instant now) {
        return !t.startsAtUtc().isAfter(now.plus(Duration.ofHours(t.requiredNoticeHours())));
    }

    /** {@code wanted}, keeping the old price if it's an increase inside the notice period. */
    private static LessonTime priced(LessonTime had, LessonTime wanted, Instant now) {
        boolean increase = wanted.priceMinor() > had.priceMinor();
        return increase && insideNotice(had, now) ? wanted.withPrice(had.priceMinor()) : wanted;
    }
}
