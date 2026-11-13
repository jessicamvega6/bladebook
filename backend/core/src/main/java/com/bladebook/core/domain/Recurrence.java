package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * A repeating booking's header, {@code CLIENT#<clientId> / RECURRENCE#<coachId>#<recurrenceId>} (ADR-MASTER section 7,
 * "Recurring bookings"). It records what was asked for; the seats are the lessons. Written after the dates, only if at
 * least one booked; never deleted.
 *
 * <p>Changing it (ADR-MASTER section 10, "By the family") only ever takes lessons away: an earlier end date, a less
 * frequent interval, or stopping it. "Future" excludes today's lesson.
 */
public record Recurrence(String coachId, String recurrenceId, String studentId, String clientId, DayOfWeek weekday,
                         LocalTime startTime, int intervalWeeks, LocalDate endDate, LocalDate startedOn, Status status) {

    public enum Status { ACTIVE, ENDED }

    public enum Change { END_EARLIER, LESS_OFTEN, STOP }

    public static String key(String coachId, String recurrenceId) {
        return "RECURRENCE#" + coachId + "#" + recurrenceId;
    }

    public String key() {
        return key(coachId, recurrenceId);
    }

    /**
     * Which of the series' remaining dates a change cancels. {@code future} are the dates of its lessons after today,
     * in order.
     *
     * @throws DomainException INVALID for an end date not before the current one or before today, or an interval that
     *                         isn't less frequent
     */
    public List<LocalDate> cancels(Change change, LocalDate newEnd, Integer newInterval, List<LocalDate> future, LocalDate today) {
        List<LocalDate> out = new ArrayList<>();
        switch (change) {
            case STOP -> out.addAll(future);
            case END_EARLIER -> {
                if (newEnd == null) {
                    throw DomainException.invalid("endDate", "Pick a new last date.");
                }
                if (!newEnd.isBefore(endDate)) {
                    throw DomainException.invalid("endDate", "Pick a date before the current last lesson.");
                }
                if (newEnd.isBefore(today)) {
                    throw DomainException.invalid("endDate", "The new last date can’t be before today.");
                }
                future.stream().filter(d -> d.isAfter(newEnd)).forEach(out::add);
            }
            case LESS_OFTEN -> {
                if (newInterval == null || newInterval <= intervalWeeks || newInterval > 4) {
                    throw DomainException.invalid("intervalWeeks", "Pick a less frequent option.");
                }
                if (!future.isEmpty()) {
                    // The first lesson still to come anchors the new interval and always stays.
                    LocalDate anchor = future.get(0);
                    future.stream().filter(d -> ChronoUnit.WEEKS.between(anchor, d) % newInterval != 0).forEach(out::add);
                }
            }
        }
        return out;
    }

    /** The header after a change: a new end date, a new interval, or ended. */
    public Recurrence after(Change change, LocalDate newEnd, Integer newInterval) {
        return switch (change) {
            case STOP -> new Recurrence(coachId, recurrenceId, studentId, clientId, weekday, startTime, intervalWeeks, endDate, startedOn, Status.ENDED);
            case END_EARLIER -> new Recurrence(coachId, recurrenceId, studentId, clientId, weekday, startTime, intervalWeeks, newEnd, startedOn, status);
            case LESS_OFTEN -> new Recurrence(coachId, recurrenceId, studentId, clientId, weekday, startTime, newInterval, endDate, startedOn, status);
        };
    }
}
