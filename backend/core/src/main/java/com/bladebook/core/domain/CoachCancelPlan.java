package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What a coach's cancel will do, worked out from the lesson times and seats as read (ADR-MASTER section 10).
 *
 * <ul>
 *   <li>A lesson is cancelled only while it's {@code BOOKED}, hasn't started, and no seat in it is checked in
 *       or marked a no-show. Anything else asked for is {@code skipped}.</li>
 *   <li><b>A lesson or a day</b>: each lesson asked for, with its own release-or-hold choice (S9).</li>
 *   <li><b>The rest of the week</b>: every booked lesson in the Sunday–Saturday week that hasn't started is held,
 *       and every open time that hasn't started is held too, with no question (S8). A future week closes all of it.</li>
 * </ul>
 * The writes re-check every condition; the plan is what the coach is shown, and what the writes start from.
 */
public record CoachCancelPlan(List<Cancel> cancels, List<LessonTime> holdOpen, int skipped) {

    /** One lesson to cancel: its seats move to {@code CANCELLED#} lines and the time is released or held. */
    public record Cancel(LessonTime time, List<Seat> seats, AfterCancel after) {

        public Cancel {
            seats = List.copyOf(seats);
        }

        /** Booked seats get a line; an unanswered invitation is removed with no record (S11). */
        public List<Seat> bookedSeats() {
            return seats.stream().filter(s -> s.seatStatus() == Seat.Status.BOOKED).toList();
        }
    }

    public CoachCancelPlan {
        cancels = List.copyOf(cancels);
        holdOpen = List.copyOf(holdOpen);
    }

    public static CoachCancelPlan of(CoachCancelRequest request, List<LessonTime> times, List<Seat> seats, Instant now) {
        Map<String, List<Seat>> byTime = new HashMap<>();
        for (Seat s : seats) {
            byTime.computeIfAbsent(LessonTime.key(s.lessonDate(), s.startTime()), k -> new ArrayList<>()).add(s);
        }
        List<Cancel> cancels = new ArrayList<>();
        List<LessonTime> holdOpen = new ArrayList<>();
        int skipped = 0;
        if (request.scope() == ChangeBatch.Source.WEEK) {
            for (LessonTime t : times) {
                if (t.lessonDate().isBefore(request.first()) || t.lessonDate().isAfter(request.last())) {
                    continue;
                }
                List<Seat> in = byTime.getOrDefault(t.key(), List.of());
                if (cancellable(t, in, now)) {
                    cancels.add(new Cancel(t, in, AfterCancel.HOLD));
                } else if (t.lessonStatus() == LessonTime.Status.OPEN && t.startsAtUtc().isAfter(now)) {
                    holdOpen.add(t);
                }
            }
            return new CoachCancelPlan(cancels, holdOpen, 0);
        }
        Map<String, LessonTime> byKey = new HashMap<>();
        times.forEach(t -> byKey.put(t.key(), t));
        for (CoachCancelRequest.Pick p : request.picks()) {
            LessonTime t = byKey.get(LessonTime.key(p.date(), p.startTime()));
            List<Seat> in = t == null ? List.of() : byTime.getOrDefault(t.key(), List.of());
            if (t != null && cancellable(t, in, now)) {
                cancels.add(new Cancel(t, in, p.after()));
            } else {
                skipped++;
            }
        }
        return new CoachCancelPlan(cancels, holdOpen, skipped);
    }

    /** Booked, not started, someone in it, and nobody checked in or marked a no-show. */
    static boolean cancellable(LessonTime t, List<Seat> seats, Instant now) {
        return t.lessonStatus() == LessonTime.Status.BOOKED && t.startsAtUtc().isAfter(now) && !seats.isEmpty()
                && seats.stream().noneMatch(s -> s.seatStatus() == Seat.Status.CHECKED_IN || s.seatStatus() == Seat.Status.NO_SHOW);
    }

    public boolean isEmpty() {
        return cancels.isEmpty() && holdOpen.isEmpty();
    }

    /** The families with a booked seat cancelled: each gets one email. */
    public Set<String> clientIds() {
        Set<String> out = new LinkedHashSet<>();
        cancels.forEach(c -> c.bookedSeats().forEach(s -> out.add(s.clientId())));
        return out;
    }

    public int heldCount() {
        return (int) cancels.stream().filter(c -> c.after() == AfterCancel.HOLD).count() + holdOpen.size();
    }

    public LocalDate firstDate() {
        return dates().stream().min(LocalDate::compareTo).orElse(null);
    }

    public LocalDate lastDate() {
        return dates().stream().max(LocalDate::compareTo).orElse(null);
    }

    private List<LocalDate> dates() {
        List<LocalDate> out = new ArrayList<>();
        cancels.forEach(c -> out.add(c.time().lessonDate()));
        holdOpen.forEach(t -> out.add(t.lessonDate()));
        return out;
    }
}
