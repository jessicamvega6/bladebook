package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Objects;

/**
 * One bookable time, {@code COACH#<coachId> / LESSON#<date>#<startTime>} (ADR-031 decision 1). The date
 * and start are the coach's local ones; {@code startsAtUtc} is the moment it starts. Batch 2 writes only
 * {@code OPEN} times; booking (Batch 4) and holding (Batch 5) come later.
 */
public record LessonTime(LocalDate lessonDate, LocalTime startTime, Instant startsAtUtc, String coachTz,
                         int durationMinutes, int priceMinor, String currency, int missedLessonFeeMinor,
                         int requiredNoticeHours, int maxSkaters, int seatsTaken, int blockSeq, IceType iceType,
                         long scheduleVersion, Status lessonStatus) {

    public enum Status { OPEN, BOOKED, HELD }

    /** The sort key: {@code LESSON#2026-11-09#06:00}. */
    public String key() {
        return key(lessonDate, startTime);
    }

    public static String key(LocalDate date, LocalTime start) {
        return "LESSON#" + date + "#" + start;
    }

    /** The same lesson as the schedule would make it: length, price, fee, currency, notice, skaters, block, ice. */
    public boolean sameStamps(LessonTime o) {
        return durationMinutes == o.durationMinutes && priceMinor == o.priceMinor
                && missedLessonFeeMinor == o.missedLessonFeeMinor && requiredNoticeHours == o.requiredNoticeHours
                && maxSkaters == o.maxSkaters && blockSeq == o.blockSeq && iceType == o.iceType
                && Objects.equals(currency, o.currency) && Objects.equals(startsAtUtc, o.startsAtUtc);
    }

    public LessonTime withPrice(int price) {
        return new LessonTime(lessonDate, startTime, startsAtUtc, coachTz, durationMinutes, price, currency,
                missedLessonFeeMinor, requiredNoticeHours, maxSkaters, seatsTaken, blockSeq, iceType, scheduleVersion,
                lessonStatus);
    }
}
