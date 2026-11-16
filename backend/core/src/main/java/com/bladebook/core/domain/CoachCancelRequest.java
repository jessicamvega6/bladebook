package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The coach cancelling from the calendar (ADR-MASTER section 10, "By the coach"): one lesson, a day, or the rest
 * of the week. For a lesson or a day, each lesson carries its own release-or-hold choice (S9). The week names only
 * its Sunday: what it closes is worked out on the server from now on, and everything is held (S8).
 */
public record CoachCancelRequest(ChangeBatch.Source scope, List<Pick> picks, LocalDate weekStart) {

    public record Pick(LocalDate date, LocalTime startTime, AfterCancel after) {
    }

    /** One pick as the website sends it. */
    public record PickInput(String date, String startTime, String after) {
    }

    /** More times than any day holds. */
    static final int MAX_PICKS = 100;

    public CoachCancelRequest {
        picks = List.copyOf(picks);
    }

    public static CoachCancelRequest parse(String scope, List<PickInput> picks, String weekStart) {
        if ("WEEK".equals(scope)) {
            if (picks != null && !picks.isEmpty()) {
                throw DomainException.invalid("picks", "Cancel rest of week picks its own lessons.");
            }
            LocalDate sunday = date(weekStart, "weekStart");
            if (sunday.getDayOfWeek() != DayOfWeek.SUNDAY) {
                throw DomainException.invalid("weekStart", "A week starts on a Sunday.");
            }
            return new CoachCancelRequest(ChangeBatch.Source.WEEK, List.of(), sunday);
        }
        ChangeBatch.Source source;
        if ("LESSON".equals(scope)) {
            source = ChangeBatch.Source.LESSON;
        } else if ("DAY".equals(scope)) {
            source = ChangeBatch.Source.DAY;
        } else {
            throw DomainException.invalid("scope", "Choose a lesson, a day or the rest of the week.");
        }
        if (picks == null || picks.isEmpty()) {
            throw DomainException.invalid("picks", "Choose at least one lesson to cancel.");
        }
        if (picks.size() > MAX_PICKS) {
            throw DomainException.invalid("picks", "That’s more lessons than one day holds.");
        }
        Map<String, Pick> unique = new LinkedHashMap<>();
        for (PickInput p : picks) {
            if (p == null) {
                throw DomainException.invalid("picks", "Choose at least one lesson to cancel.");
            }
            Pick pick = new Pick(date(p.date(), "date"), time(p.startTime()), AfterCancel.parse(p.after()));
            unique.putIfAbsent(pick.date() + "#" + pick.startTime(), pick);
        }
        List<Pick> out = new ArrayList<>(unique.values());
        if (source == ChangeBatch.Source.LESSON && out.size() != 1) {
            throw DomainException.invalid("picks", "Cancel one lesson at a time here.");
        }
        if (source == ChangeBatch.Source.DAY && out.stream().map(Pick::date).distinct().count() != 1) {
            throw DomainException.invalid("picks", "Cancel day takes the lessons of one day.");
        }
        return new CoachCancelRequest(source, out, null);
    }

    /** The first and last dates the request can touch. */
    public LocalDate first() {
        return scope == ChangeBatch.Source.WEEK ? weekStart : picks.stream().map(Pick::date).min(LocalDate::compareTo).orElseThrow();
    }

    public LocalDate last() {
        return scope == ChangeBatch.Source.WEEK ? weekStart.plusDays(6) : picks.stream().map(Pick::date).max(LocalDate::compareTo).orElseThrow();
    }

    private static LocalDate date(String v, String field) {
        try {
            return LocalDate.parse(v);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid(field, "That date isn’t valid.");
        }
    }

    private static LocalTime time(String v) {
        try {
            return LocalTime.parse(v);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("startTime", "That time isn’t valid.");
        }
    }
}
