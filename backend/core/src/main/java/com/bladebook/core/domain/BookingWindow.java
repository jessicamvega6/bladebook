package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;

/**
 * The dates a family can pick: today through the end of the month two months after this one, in the coach's
 * time zone (ADR-031 decision 3). Checked with the request's other checks, before anything is written: one
 * pick outside it refuses the whole request. It only grows as time passes, so a retry is never refused by it.
 */
public record BookingWindow(LocalDate first, LocalDate last) {

    /** The product wording (FeatureDecriptions/Bookings:, the booking window). The page never offers such a date. */
    static final String TOO_FAR = "That date is further ahead than you can book.";
    static final String PASSED = "That date has already passed.";

    public static BookingWindow of(LocalDate today) {
        return new BookingWindow(today, Weeks.bookingWindowEnd(today));
    }

    /** The window as it stands for a coach in {@code zone} at {@code now}. */
    public static BookingWindow at(Instant now, ZoneId zone) {
        return of(LocalDate.ofInstant(now, zone));
    }

    public boolean contains(LocalDate date) {
        return !date.isBefore(first) && !date.isAfter(last);
    }

    /** @throws DomainException INVALID if any date is outside the window */
    public void requireAll(Collection<LocalDate> dates) {
        for (LocalDate d : dates) {
            if (d.isBefore(first)) {
                throw DomainException.invalid("picks", PASSED);
            }
            if (d.isAfter(last)) {
                throw DomainException.invalid("picks", TOO_FAR);
            }
        }
    }
}
