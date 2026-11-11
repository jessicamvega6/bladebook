package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * One skater's place in one lesson time, {@code COACH#<coachId> / SEAT#<date>#<startTime>#<studentId>}
 * (ADR-031 decision 2). It copies the time's start, zone and length so the reminder jobs never need the lesson
 * time, and holds no amount: a share is worked out from the lesson time (decision 7).
 *
 * <p>Batch 4 writes {@code BOOKED} seats for one skater. Sharing, attendance, payment and the reminder flags
 * come with their batches.
 */
public record Seat(String coachId, LocalDate lessonDate, LocalTime startTime, String studentId, String clientId,
                   String studentName, Status seatStatus, Instant startsAtUtc, String coachTz, int durationMinutes,
                   Instant joinedAt, String idempotencyKey) {

    /** {@code AWAITING_COACH} is Phase 2 (ADR-033). */
    public enum Status { INVITED, BOOKED, CHECKED_IN, NO_SHOW }

    public static String key(LocalDate date, LocalTime start, String studentId) {
        return "SEAT#" + date + "#" + start + "#" + studentId;
    }

    public String key() {
        return key(lessonDate, startTime, studentId);
    }

    /** A new {@code BOOKED} seat on {@code time} for one skater. */
    public static Seat booked(String coachId, AvailableTime time, String studentId, String clientId, String fullName,
                              Instant now, String idempotencyKey) {
        return new Seat(coachId, time.lessonDate(), time.startTime(), studentId, clientId, DisplayName.of(fullName),
                Status.BOOKED, time.startsAtUtc(), time.coachTz(), time.durationMinutes(), now, idempotencyKey);
    }

    public boolean hasStarted(Instant now) {
        return !startsAtUtc.isAfter(now);
    }
}
