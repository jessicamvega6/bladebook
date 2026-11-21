package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The checks on time off and special schedules before review (ADR-MASTER section 6; FeatureDecriptions/Schedule
 * Creater.md, "Checks before review"; C_Coach Time Off.md). An overlap with another one is rejected, never warned
 * about, and the message names it, the dates they share, and the way out.
 *
 * <p>Lengths (settled in Batch 6): a special schedule runs at most 31 days, as many as the editor shows one column
 * each; time off at most 366.
 */
public final class TempRules {

    static final int MAX_SPECIAL_DAYS = 31;
    static final int MAX_TIME_OFF_DAYS = 366;

    private TempRules() {
    }

    /**
     * Everything that stops it being reviewed. Empty means it can be saved.
     *
     * @param others every other time off and special schedule the coach has (this one, by its id, is skipped)
     * @param savedStart the start it had when it was opened for editing, or {@code null} for a new one: an edit may
     *                   keep a start that has passed (a camp that's running), but can't move one into the past
     */
    public static List<String> problems(TempSchedule t, List<TempSchedule> others, LocalDate today, LocalDate savedStart) {
        boolean off = t.kind() == TempSchedule.Kind.TIME_OFF;
        List<String> out = new ArrayList<>();
        if (t.name().length() > ScheduleRules.MAX_NAME) {
            out.add("The name can be up to " + ScheduleRules.MAX_NAME + " characters.");
        } else if (t.name().chars().anyMatch(Character::isISOControl)) {
            out.add("The name has a character it can’t hold.");
        }
        if (t.startDate() == null || t.endDate() == null) {
            out.add(off ? "Time off needs a first and last day." : "A special schedule needs a start and end date.");
        } else if (t.endDate().isBefore(t.startDate())) {
            out.add(off ? "The last day is before the first day." : "The end date is before the start date.");
        } else {
            if (t.startDate().isBefore(today) && !t.startDate().equals(savedStart)) {
                out.add(off ? "The first day off can’t be in the past." : "The start date can’t be in the past.");
            }
            long days = t.dates().size();
            if (off && days > MAX_TIME_OFF_DAYS) {
                out.add("Time off can be at most " + MAX_TIME_OFF_DAYS + " days. Add another for the rest.");
            } else if (!off && days > MAX_SPECIAL_DAYS) {
                out.add("A special schedule can be at most " + MAX_SPECIAL_DAYS + " days.");
            }
            for (TempSchedule o : others) {
                if (o.tempId().equals(t.tempId())) {
                    continue;
                }
                LocalDate[] shared = t.overlap(o);
                if (shared != null) {
                    out.add("These dates overlap " + o.displayName() + " (" + range(o.startDate(), o.endDate()) + ") on "
                            + range(shared[0], shared[1]) + ". Edit " + o.displayName()
                            + " to change those days, or choose dates outside it.");
                }
            }
        }
        if (!off) {
            out.addAll(blockProblems(t));
        }
        return out;
    }

    /** The weekly editor's block checks, on one day standing for every date, worded for dates. */
    private static List<String> blockProblems(TempSchedule t) {
        List<BlockTemplate> asOneDay = t.templates().stream().map(b -> new BlockTemplate(b.seq(), b.name(), b.startTime(),
                b.endTime(), b.lessonMinutes(), b.priceMinor(), b.maxSkaters(), b.iceType(), Set.of(DayOfWeek.MONDAY), null)).toList();
        String monday = DayOfWeek.MONDAY.getDisplayName(TextStyle.FULL, Locale.US) + ": ";
        return ScheduleRules.problems(asOneDay).stream().map(p -> p.startsWith(monday) ? "On these dates, " + p.substring(monday.length()) : p).toList();
    }

    /** {@code Dec 21 – 27}, {@code Nov 30 – Dec 4}, {@code Dec 21}: the design's date ranges. */
    public static String range(LocalDate a, LocalDate b) {
        String first = month(a) + " " + a.getDayOfMonth();
        if (a.equals(b)) {
            return first;
        }
        return a.getMonth() == b.getMonth() && a.getYear() == b.getYear()
                ? first + " – " + b.getDayOfMonth() : first + " – " + month(b) + " " + b.getDayOfMonth();
    }

    private static String month(LocalDate d) {
        return d.getMonth().getDisplayName(TextStyle.SHORT, Locale.US);
    }
}
