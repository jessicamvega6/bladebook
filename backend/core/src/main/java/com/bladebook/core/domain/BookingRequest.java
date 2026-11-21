package com.bladebook.core.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * One family's request to book times with one coach for one skater (ADR-MASTER section 7). Each pick is one date, or,
 * with {@code repeat}, the first of a series: the same weekday and time every 1 to 4 weeks up to an end date no more
 * than 12 months after the first pick (Batch 9). The coach and skater IDs are checked against the family's own links
 * later ({@code ClientLinks.requireActive}); here they're only carried.
 *
 * @param idempotencyKey made by the website for this request, and sent again unchanged on a retry
 */
public record BookingRequest(String coachId, String studentId, String idempotencyKey, List<Pick> picks, Repeat repeat) {

    /** Every {@code everyWeeks} weeks, up to and including {@code until}. */
    public record Repeat(int everyWeeks, LocalDate until) {
    }

    /** One date the request books; {@code recurrenceId} names its series, or is null for a single date. */
    public record Occurrence(LocalDate date, LocalTime startTime, String recurrenceId, int intervalWeeks) {
    }

    /** Dates one request books, all series together: far more than a year of weekly lessons at a few times. */
    static final int MAX_OCCURRENCES = 300;

    /** Picks in one request. The booking page shows about three months, so this is far more than a family picks. */
    static final int MAX_PICKS = 50;
    static final String UNREADABLE = "Something in your picks couldn’t be read. Reload the page and try again.";

    private static final Pattern KEY = Pattern.compile("^[A-Za-z0-9-]{8,64}$");

    /** One picked time: the coach's local date and start time, as the lesson time's key has them. */
    public record Pick(LocalDate date, LocalTime startTime) {
    }

    /** A pick as the website sends it: {@code "2026-11-16"} and {@code "06:00"}. */
    public record PickInput(String date, String startTime) {
    }

    public BookingRequest {
        picks = List.copyOf(picks);
    }

    public BookingRequest(String coachId, String studentId, String idempotencyKey, List<Pick> picks) {
        this(coachId, studentId, idempotencyKey, picks, null);
    }

    /** @throws DomainException INVALID for a missing or unsafe key, no picks, too many, or one that can't be read */
    public static BookingRequest parse(String coachId, String studentId, String idempotencyKey, List<PickInput> inputs) {
        if (idempotencyKey == null || !KEY.matcher(idempotencyKey).matches()) {
            throw DomainException.invalid("idempotencyKey", "Reload the page and try again.");
        }
        if (inputs == null || inputs.isEmpty()) {
            throw DomainException.invalid("picks", "Pick at least one time.");
        }
        TreeSet<Pick> picks = new TreeSet<>(Comparator.comparing(Pick::date).thenComparing(Pick::startTime));
        for (PickInput in : inputs) {
            picks.add(read(in));
        }
        if (picks.size() > MAX_PICKS) {
            throw DomainException.invalid("picks", "Book up to 50 lessons at a time.");
        }
        return new BookingRequest(coachId, studentId, idempotencyKey, new ArrayList<>(picks));
    }

    /**
     * As above, with repeating: {@code repeat} false or null books each pick once.
     *
     * @throws DomainException INVALID as above, or for a missing end date, one before the first pick or more than 12 months
     *                         after it, an interval outside 1 to 4 weeks, or more than 300 dates in all
     */
    public static BookingRequest parse(String coachId, String studentId, String idempotencyKey, List<PickInput> inputs,
                                       Boolean repeat, Integer everyWeeks, String until) {
        BookingRequest r = parse(coachId, studentId, idempotencyKey, inputs);
        if (repeat == null || !repeat) {
            return r;
        }
        if (everyWeeks == null || everyWeeks < 1 || everyWeeks > 4) {
            throw DomainException.invalid("everyWeeks", "Pick how often it repeats.");
        }
        LocalDate end;
        try {
            end = until == null ? null : LocalDate.parse(until);
        } catch (DateTimeParseException e) {
            end = null;
        }
        if (end == null) {
            throw DomainException.invalid("until", "Pick an end date.");
        }
        LocalDate first = r.picks().get(0).date();
        if (end.isBefore(first)) {
            throw DomainException.invalid("until", "The end date is before your first lesson.");
        }
        if (end.isAfter(first.plusDays(365))) {
            throw DomainException.invalid("until", "A repeating booking can run up to 12 months.");
        }
        BookingRequest out = new BookingRequest(coachId, studentId, idempotencyKey, r.picks(), new Repeat(everyWeeks, end));
        if (out.occurrences().size() > MAX_OCCURRENCES) {
            throw DomainException.invalid("until", "That’s more than " + MAX_OCCURRENCES + " lessons. Pick an earlier end date.");
        }
        return out;
    }

    /**
     * Every date to book, in order. With repeat, each pick repeats on its weekday every N weeks to the end date. Picks on the
     * same weekday and time are one series; its {@code recurrenceId} is derived from the key, the weekday and the time, so a
     * retry with the same key names the same series (ADR-MASTER section 7, "Idempotency").
     */
    public List<Occurrence> occurrences() {
        TreeSet<Occurrence> out = new TreeSet<>(Comparator.comparing(Occurrence::date).thenComparing(Occurrence::startTime));
        for (Pick p : picks) {
            if (repeat == null) {
                out.add(new Occurrence(p.date(), p.startTime(), null, 0));
                continue;
            }
            String rid = recurrenceId(idempotencyKey, p.date().getDayOfWeek(), p.startTime());
            for (LocalDate d = p.date(); !d.isAfter(repeat.until()); d = d.plusWeeks(repeat.everyWeeks())) {
                out.add(new Occurrence(d, p.startTime(), rid, repeat.everyWeeks()));
            }
        }
        return new ArrayList<>(out);
    }

    public static String recurrenceId(String idempotencyKey, java.time.DayOfWeek weekday, LocalTime start) {
        return java.util.UUID.nameUUIDFromBytes((idempotencyKey + "|" + weekday + "|" + start).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
    }

    /** Every picked date, in order, for the window check: a series' later dates may run past the window. */
    public List<LocalDate> dates() {
        return picks.stream().map(Pick::date).distinct().toList();
    }

    private static Pick read(PickInput in) {
        if (in == null || in.date() == null || in.startTime() == null) {
            throw DomainException.invalid("picks", UNREADABLE);
        }
        try {
            return new Pick(LocalDate.parse(in.date()), LocalTime.parse(in.startTime()));
        } catch (DateTimeParseException e) {
            throw DomainException.invalid("picks", UNREADABLE);
        }
    }
}
