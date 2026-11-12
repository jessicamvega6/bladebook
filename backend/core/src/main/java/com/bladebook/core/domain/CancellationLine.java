package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * One cancelled seat, {@code COACH#<coachId> / CANCELLED#<isoTs>#<batchId>#<seatKey>} (ADR-MASTER sections 3 and 10).
 * A seat that ends is moved, not kept: the seat is deleted and this line put in the same transaction, so the key
 * is free for the skater to book again. {@code priceMinor} is the skater's share when it was cancelled.
 *
 * <p>Batch 5 writes every line {@code EXECUTED}. {@code recurrenceId} waits for repeating bookings (Batch 9) and the
 * notification fields for the notification batch.
 */
public record CancellationLine(String batchId, String batchStamp, String seatKey, LocalDate lessonDate, LocalTime startTime,
                               int durationMinutes, int priceMinor, String currency, String studentId, String studentName,
                               String clientId, ChangeBatch.By cancelledBy, Instant cancelledAt, long noticeHours,
                               ChangeBatch.Execution executionStatus) {

    public String key() {
        return "CANCELLED#" + batchStamp + "#" + batchId + "#" + seatKey;
    }

    /** The line for {@code seat}, cancelled now in {@code batch}. */
    public static CancellationLine of(ChangeBatch batch, Seat seat, int shareMinor, String currency, Instant now) {
        return new CancellationLine(batch.batchId(), batch.stamp(), seat.key(), seat.lessonDate(), seat.startTime(),
                seat.durationMinutes(), shareMinor, currency, seat.studentId(), seat.studentName(), seat.clientId(),
                batch.cancelledBy(), now, Notice.hoursBefore(seat.startsAtUtc(), now), ChangeBatch.Execution.EXECUTED);
    }
}
