package com.bladebook.core.domain;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * One seat whose share of the price a schedule change moves, {@code COACH#<coachId> / REPRICED#<isoTs>#<batchId>#<seatKey>}
 * (ADR-MASTER sections 3 and 9). Prices are the skater's share before and after.
 */
public record RepriceLine(String batchId, String batchStamp, String seatKey, LocalDate lessonDate, LocalTime startTime,
                          String studentId, String studentName, String clientId, int oldPriceMinor, int newPriceMinor,
                          String currency, ChangeBatch.Execution executionStatus) {

    public String key() {
        return "REPRICED#" + batchStamp + "#" + batchId + "#" + seatKey;
    }

    public String direction() {
        return newPriceMinor > oldPriceMinor ? "UP" : "DOWN";
    }

    /** A planned line for {@code seat}: carried out later, in the lesson's own transaction. */
    public static RepriceLine planned(ChangeBatch batch, Seat seat, int oldShare, int newShare, String currency) {
        return new RepriceLine(batch.batchId(), batch.stamp(), seat.key(), seat.lessonDate(), seat.startTime(), seat.studentId(),
                seat.studentName(), seat.clientId(), oldShare, newShare, currency, ChangeBatch.Execution.PLANNED);
    }
}
