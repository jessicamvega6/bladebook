package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

/** Week and window arithmetic, all on the coach's local dates (ADR-MASTER sections 6, 7 and 14). */
public final class Weeks {

    private Weeks() {
    }

    /** The Sunday that starts {@code date}'s Sunday–Saturday week. */
    public static LocalDate sunday(LocalDate date) {
        return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
    }

    /** The last day a family can book: the end of the month two months after this one. */
    public static LocalDate bookingWindowEnd(LocalDate today) {
        return today.plusMonths(2).with(TemporalAdjusters.lastDayOfMonth());
    }

    /** How far ahead lesson times are kept: the booking window plus 12 months (ADR-031 decision 1). */
    public static LocalDate storeUntil(LocalDate today) {
        return today.plusMonths(14).with(TemporalAdjusters.lastDayOfMonth());
    }
}
