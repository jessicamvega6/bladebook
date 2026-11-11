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
 * One family's request to book times with one coach for one skater (ADR-MASTER section 7). Each pick is one
 * date; repeating picks are Batch 9. The coach and skater IDs are checked against the family's own links
 * later ({@code ClientLinks.requireActive}); here they're only carried.
 *
 * @param idempotencyKey made by the website for this request, and sent again unchanged on a retry
 */
public record BookingRequest(String coachId, String studentId, String idempotencyKey, List<Pick> picks) {

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

    /** Every picked date, in order, for the window check. */
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
