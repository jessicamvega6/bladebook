package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Recording attendance (ADR-MASTER section 11; ADR-014). Two outcomes per seat: present ({@code CHECKED_IN}) or absent
 * ({@code NO_SHOW}). The phone's tap time, {@code outcomeAt}, is accepted whenever it arrives if it falls between one
 * hour before the lesson's start and the end of that day on the coach's clock, and isn't in the future beyond a small
 * clock skew.
 */
public final class Attendance {

    /** What a seat shows on the coach's pages: a booked seat whose lesson has ended with nothing recorded is "Not recorded". */
    public enum Shown { BOOKED, CHECKED_IN, NO_SHOW, NOT_RECORDED }

    static final Duration EARLY = Duration.ofHours(1);
    /** The clock-skew allowance for a phone running slightly fast (settled in Batch 7). */
    static final Duration SKEW = Duration.ofMinutes(2);

    private Attendance() {
    }

    public static boolean fits(Instant startsAtUtc, String coachTz, Instant outcomeAt, Instant now) {
        ZoneId zone = ZoneId.of(coachTz);
        LocalDate day = LocalDate.ofInstant(startsAtUtc, zone);
        Instant endOfDay = day.plusDays(1).atStartOfDay(zone).toInstant();
        return !outcomeAt.isBefore(startsAtUtc.minus(EARLY)) && outcomeAt.isBefore(endOfDay) && !outcomeAt.isAfter(now.plus(SKEW));
    }

    public static Shown statusOf(Seat.Status status, Instant startsAtUtc, int durationMinutes, Instant now) {
        return switch (status) {
            case CHECKED_IN -> Shown.CHECKED_IN;
            case NO_SHOW -> Shown.NO_SHOW;
            default -> startsAtUtc.plus(Duration.ofMinutes(durationMinutes)).isAfter(now) ? Shown.BOOKED : Shown.NOT_RECORDED;
        };
    }

    public static Seat.Status outcome(String value) {
        if ("CHECKED_IN".equals(value)) {
            return Seat.Status.CHECKED_IN;
        }
        if ("NO_SHOW".equals(value)) {
            return Seat.Status.NO_SHOW;
        }
        throw DomainException.invalid("outcome", "Choose Present or No-show.");
    }
}
