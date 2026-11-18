package com.bladebook.core.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The coach cancelling a day or the rest of the week (ADR-MASTER section 10; owner, 2026-11-18, I24): those dates become
 * time off, not cancelled lesson by lesson. What that means for the coach's dated schedules, worked out here:
 * <ul>
 *   <li>dates in no time off or special schedule: a new time off named {@value #NAME}, one per run of days in a row;</li>
 *   <li>dates inside a special schedule: every time of that schedule is switched off on those dates, and the rest of
 *       it stays;</li>
 *   <li>dates already in a time off: already empty, so nothing.</li>
 * </ul>
 * So a cancel never overlaps another time off or special schedule, and never shows an overlap error.
 */
public final class CoachCancelDays {

    /** What the coach's calendar calls a time off made by a cancel (I24). */
    public static final String NAME = "Cancelled";

    /**
     * What to save. {@code newTimeOff} have no {@code tempId} yet. {@code specials} pairs each changed special schedule
     * (as it should be stored) with what it was, for the save's preview of what goes.
     */
    public record Plan(List<TempSchedule> newTimeOff, List<Change> specials) {
        public boolean isEmpty() {
            return newTimeOff.isEmpty() && specials.isEmpty();
        }
    }

    /** A special schedule with dates switched off: {@code after} replaces {@code before}. */
    public record Change(TempSchedule before, TempSchedule after) {
    }

    private CoachCancelDays() {
    }

    /** {@code first} to {@code last}, inclusive, against the coach's dated schedules ({@code temps}). */
    public static Plan plan(LocalDate first, LocalDate last, List<TempSchedule> temps) {
        if (last.isBefore(first)) {
            return new Plan(List.of(), List.of());
        }
        List<TempSchedule> timeOff = new ArrayList<>();
        Map<TempSchedule, List<LocalDate>> inSpecial = new HashMap<>();
        List<LocalDate> run = new ArrayList<>();
        for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
            TempSchedule covering = covering(temps, d);
            if (covering == null) {
                run.add(d);
                continue;
            }
            flush(run, timeOff);
            if (covering.kind() == TempSchedule.Kind.SPECIAL) {
                inSpecial.computeIfAbsent(covering, k -> new ArrayList<>()).add(d);
            }
        }
        flush(run, timeOff);
        List<Change> specials = new ArrayList<>();
        inSpecial.forEach((t, dates) -> {
            TempSchedule after = switchOff(t, dates);
            if (!after.equals(t)) {
                specials.add(new Change(t, after));
            }
        });
        specials.sort((a, b) -> a.before().startDate().compareTo(b.before().startDate()));
        return new Plan(List.copyOf(timeOff), List.copyOf(specials));
    }

    private static TempSchedule covering(List<TempSchedule> temps, LocalDate d) {
        for (TempSchedule t : temps) {
            if (t.covers(d)) {
                return t;
            }
        }
        return null;
    }

    private static void flush(List<LocalDate> run, List<TempSchedule> out) {
        if (!run.isEmpty()) {
            out.add(new TempSchedule(null, TempSchedule.Kind.TIME_OFF, NAME, run.get(0), run.get(run.size() - 1), List.of(), Map.of()));
            run.clear();
        }
    }

    /** Every time of every block switched off on {@code dates}, keeping what was already off. */
    static TempSchedule switchOff(TempSchedule t, List<LocalDate> dates) {
        Map<Integer, Map<LocalDate, Set<LocalTime>>> off = new HashMap<>();
        t.off().forEach((seq, byDate) -> off.put(seq, new HashMap<>(byDate)));
        for (BlockTemplate b : t.templates()) {
            List<LocalTime> times = Slots.expand(b.startTime(), b.effectiveEnd(), b.lessonMinutes());
            Map<LocalDate, Set<LocalTime>> byDate = off.computeIfAbsent(b.seq(), k -> new HashMap<>());
            for (LocalDate d : dates) {
                Set<LocalTime> s = new HashSet<>(byDate.getOrDefault(d, Set.of()));
                s.addAll(times);
                byDate.put(d, s);
            }
        }
        return new TempSchedule(t.tempId(), t.kind(), t.name(), t.startDate(), t.endDate(), t.templates(), off);
    }
}
