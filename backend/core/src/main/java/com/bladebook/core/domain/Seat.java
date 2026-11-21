package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * One skater's place in one lesson time, {@code COACH#<coachId> / SEAT#<date>#<startTime>#<studentId>}
 * (ADR-031 decision 2). It copies the time's start, zone and length so the reminder jobs never need the lesson
 * time, and holds no amount: a share is worked out from the lesson time (decision 7).
 *
 * <p>A seat booked as part of a series carries its {@code recurrenceId} and {@code bookedIntervalWeeks}, never updated
 * (ADR-MASTER section 7, "Recurring bookings"; Batch 9). What sharing adds (Batch 11) is in {@link Share}; the reminder
 * flags come with their batch.
 *
 * <p>An {@code INVITED} seat has no {@code clientId} until its family accepts (ADR-MASTER section 8).
 */
public record Seat(String coachId, LocalDate lessonDate, LocalTime startTime, String studentId, String clientId,
                   String studentName, Status seatStatus, Instant startsAtUtc, String coachTz, int durationMinutes,
                   Instant joinedAt, String idempotencyKey, String recurrenceId, int bookedIntervalWeeks, Share share) {

    public Seat {
        share = share == null ? Share.NONE : share;
    }

    /**
     * A seat's sharing fields (ADR-MASTER sections 7 and 8).
     *
     * <ul>
     *   <li>{@code inviteId}: one invitation, on every date it covers; on the invited seat and the inviting family's seat.</li>
     *   <li>{@code invitedByClientId}, {@code invitedByName}: on the invited seat, the family that invited and its contact's
     *       name, for the invitation page (the name isn't in the ADR's list; settled in Batch 11).</li>
     *   <li>{@code invitedStudentId}: on the inviting family's seat, the skater it invited, so its cancel can end the
     *       invitation without reading another family's seat (settled in Batch 11).</li>
     *   <li>{@code invitedClientId}: on the invited seat, the invited family, copied by {@code consumer-invite}.</li>
     *   <li>{@code partnerName}, {@code partnerStatus}: the other skater's display name and status ({@code INVITED},
     *       {@code BOOKED} or {@code LEFT}), copied by {@code consumer-invite}.</li>
     *   <li>{@code choiceAnswerBy}: on the staying seat while a pending leave waits, copied by {@code consumer-invite}.</li>
     *   <li>{@code freedPlace}: the staying family kept the lesson at the full price, so it can take a one-lesson invitation
     *       (settled in Batch 11: the family can't read the lesson time's history).</li>
     * </ul>
     */
    public record Share(String inviteId, String invitedByClientId, String invitedByName, String invitedStudentId,
                        String invitedClientId, String partnerName, String partnerStatus, Instant choiceAnswerBy, boolean freedPlace) {

        public static final Share NONE = new Share(null, null, null, null, null, null, null, null, false);
    }

    /** A seat with no sharing fields. */
    public Seat(String coachId, LocalDate lessonDate, LocalTime startTime, String studentId, String clientId, String studentName,
                Status seatStatus, Instant startsAtUtc, String coachTz, int durationMinutes, Instant joinedAt, String idempotencyKey,
                String recurrenceId, int bookedIntervalWeeks) {
        this(coachId, lessonDate, startTime, studentId, clientId, studentName, seatStatus, startsAtUtc, coachTz, durationMinutes,
                joinedAt, idempotencyKey, recurrenceId, bookedIntervalWeeks, Share.NONE);
    }

    /** A seat that isn't part of a series. */
    public Seat(String coachId, LocalDate lessonDate, LocalTime startTime, String studentId, String clientId, String studentName,
                Status seatStatus, Instant startsAtUtc, String coachTz, int durationMinutes, Instant joinedAt, String idempotencyKey) {
        this(coachId, lessonDate, startTime, studentId, clientId, studentName, seatStatus, startsAtUtc, coachTz, durationMinutes,
                joinedAt, idempotencyKey, null, 0);
    }

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
        return booked(coachId, time, studentId, clientId, fullName, now, idempotencyKey, null, 0);
    }

    /** As above, as one date of a series ({@code recurrenceId} null for a single date). */
    public static Seat booked(String coachId, AvailableTime time, String studentId, String clientId, String fullName,
                              Instant now, String idempotencyKey, String recurrenceId, int intervalWeeks) {
        return new Seat(coachId, time.lessonDate(), time.startTime(), studentId, clientId, DisplayName.of(fullName),
                Status.BOOKED, time.startsAtUtc(), time.coachTz(), time.durationMinutes(), now, idempotencyKey, recurrenceId,
                recurrenceId == null ? 0 : intervalWeeks);
    }

    public Seat withShare(Share s) {
        return new Seat(coachId, lessonDate, startTime, studentId, clientId, studentName, seatStatus, startsAtUtc, coachTz,
                durationMinutes, joinedAt, idempotencyKey, recurrenceId, bookedIntervalWeeks, s);
    }

    /**
     * The invited skater's seat, {@code INVITED}, on the same time as the inviting skater's (ADR-MASTER section 8). A series'
     * dates share one {@code inviteId}, but the seat isn't part of the inviting family's series: the invited family cancels
     * its dates one by one, and never changes the other family's series (settled in Batch 11).
     */
    public static Seat invited(Seat host, String invitedStudentId, String invitedFullName, String inviteId, String invitedByName) {
        return new Seat(host.coachId(), host.lessonDate(), host.startTime(), invitedStudentId, null, DisplayName.of(invitedFullName),
                Status.INVITED, host.startsAtUtc(), host.coachTz(), host.durationMinutes(), host.joinedAt(), host.idempotencyKey(),
                null, 0,
                new Share(inviteId, host.clientId(), invitedByName, null, null, null, null, null, false));
    }

    public boolean hasStarted(Instant now) {
        return !startsAtUtc.isAfter(now);
    }
}
