package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** Recording attendance (ADR-MASTER section 11): when an outcome time fits its lesson, and what a seat shows. */
class AttendanceTest {

    /** Monday, November 16, 2026, 6:00 AM in Chicago, for 30 minutes. */
    private static final Instant START = Instant.parse("2026-11-16T12:00:00Z");
    private static final String TZ = "America/Chicago";
    /** Monday, 11:00 PM in Chicago. */
    private static final Instant LATE_MONDAY = Instant.parse("2026-11-17T05:00:00Z");

    private static boolean fits(String outcomeAt, String now) {
        return Attendance.fits(START, TZ, Instant.parse(outcomeAt), Instant.parse(now));
    }

    @Test
    void fromAnHourBeforeTheStart() {
        assertThat(fits("2026-11-16T11:00:00Z", "2026-11-16T11:00:00Z")).isTrue();
        assertThat(fits("2026-11-16T10:59:59Z", "2026-11-16T11:00:00Z")).isFalse();
    }

    @Test
    void toTheEndOfThatDayOnTheCoachsClock() {
        assertThat(fits("2026-11-17T05:59:59Z", "2026-11-17T06:00:00Z")).isTrue();   // 11:59:59 PM Monday
        assertThat(fits("2026-11-17T06:00:00Z", "2026-11-17T06:00:00Z")).isFalse();  // midnight: Tuesday
    }

    @Test
    void acceptedWhenItArrivesLaterIfTheTapTimeFits() {
        assertThat(fits("2026-11-16T12:05:00Z", "2026-11-20T15:00:00Z")).isTrue();
    }

    @Test
    void notInTheFutureBeyondASmallClockSkew() {
        assertThat(fits("2026-11-16T12:02:00Z", "2026-11-16T12:00:00Z")).isTrue();
        assertThat(fits("2026-11-16T12:02:01Z", "2026-11-16T12:00:00Z")).isFalse();
        assertThat(fits(LATE_MONDAY.toString(), "2026-11-16T12:00:00Z")).isFalse();
    }

    @Test
    void aSeatShowsNotRecordedOnceItsLessonHasEndedWithNothingRecorded() {
        Instant during = START.plusSeconds(10 * 60), after = START.plusSeconds(30 * 60);
        assertThat(Attendance.statusOf(Seat.Status.BOOKED, START, 30, during)).isEqualTo(Attendance.Shown.BOOKED);
        assertThat(Attendance.statusOf(Seat.Status.BOOKED, START, 30, after)).isEqualTo(Attendance.Shown.NOT_RECORDED);
        assertThat(Attendance.statusOf(Seat.Status.CHECKED_IN, START, 30, after)).isEqualTo(Attendance.Shown.CHECKED_IN);
        assertThat(Attendance.statusOf(Seat.Status.NO_SHOW, START, 30, during)).isEqualTo(Attendance.Shown.NO_SHOW);
    }

    @Test
    void onlyPresentOrAbsentIsAnOutcome() {
        assertThat(Attendance.outcome("CHECKED_IN")).isEqualTo(Seat.Status.CHECKED_IN);
        assertThat(Attendance.outcome("NO_SHOW")).isEqualTo(Seat.Status.NO_SHOW);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> Attendance.outcome("BOOKED"))
                .isInstanceOf(DomainException.class).hasMessage("Choose Present or No-show.");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> Attendance.outcome(null)).isInstanceOf(DomainException.class);
    }
}
