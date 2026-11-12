package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** The notice period (ADR-MASTER section 10; B6: 24 hours, from the lesson's own stamp). */
class NoticeTest {

    /** Monday, November 16, 2026, 6:00 AM in Chicago. */
    private static final Instant START = Instant.parse("2026-11-16T12:00:00Z");

    @Test
    void exactlyTwentyFourHoursBeforeIsInTime() {
        assertThat(Notice.isLate(START, 24, Instant.parse("2026-11-15T12:00:00Z"))).isFalse();
    }

    @Test
    void aSecondUnderTwentyFourHoursIsLate() {
        assertThat(Notice.isLate(START, 24, Instant.parse("2026-11-15T12:00:01Z"))).isTrue();
    }

    @Test
    void aMillisecondUnderIsLateToo() {
        assertThat(Notice.isLate(START, 24, Instant.parse("2026-11-15T12:00:00.001Z"))).isTrue();
    }

    @Test
    void wellAheadIsInTime() {
        assertThat(Notice.isLate(START, 24, Instant.parse("2026-11-10T15:00:00Z"))).isFalse();
    }

    @Test
    void aMinuteBeforeTheStartIsLate() {
        assertThat(Notice.isLate(START, 24, Instant.parse("2026-11-16T11:59:00Z"))).isTrue();
    }

    @Test
    void aLessonThatHasStartedIsNotLateItCantBeCancelled() {
        assertThat(Notice.isLate(START, 24, START)).isFalse();
        assertThat(Notice.isLate(START, 24, START.plusSeconds(60))).isFalse();
    }

    @Test
    void theLessonsOwnNoticePeriodIsUsed() {
        Instant now = Instant.parse("2026-11-15T00:00:00Z"); // 36 hours before
        assertThat(Notice.isLate(START, 24, now)).isFalse();
        assertThat(Notice.isLate(START, 48, now)).isTrue();
    }

    @Test
    void aZeroNoticePeriodIsNeverLate() {
        assertThat(Notice.isLate(START, 0, START.minusSeconds(1))).isFalse();
    }

    @Test
    void hoursBeforeRoundsDownAndIsZeroOnceStarted() {
        assertThat(Notice.hoursBefore(START, Instant.parse("2026-11-15T12:00:00Z"))).isEqualTo(24);
        assertThat(Notice.hoursBefore(START, Instant.parse("2026-11-15T12:00:01Z"))).isEqualTo(23);
        assertThat(Notice.hoursBefore(START, Instant.parse("2026-11-16T11:59:00Z"))).isZero();
        assertThat(Notice.hoursBefore(START, START.plusSeconds(3600))).isZero();
    }
}
