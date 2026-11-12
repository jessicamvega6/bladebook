package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Objects;

/**
 * A change-batch header, {@code COACH#<coachId> / CHANGEBATCH#<isoTs>#<batchId>} (ADR-MASTER section 9,
 * "Change-batch records"). Every cancellation writes one, with a {@link CancellationLine} per seat; a
 * single-lesson cancel is a batch of one, written with its line already {@code EXECUTED}.
 */
public record ChangeBatch(String batchId, Instant createdAt, Source batchSource, By cancelledBy, String actedBy,
                          LocalDate affectedFrom, LocalDate affectedTo, int lessonCount, int clientCount,
                          Execution executionStatus) {

    /** {@code batchSource}: what made the batch. Batch 5 writes {@code LESSON}, {@code DAY} and {@code WEEK}. */
    public enum Source { DEFAULT, DATE_OVERRIDE, LESSON, DAY, WEEK, RECURRENCE, RECONCILE }

    /** {@code cancelledBy}. */
    public enum By { CLIENT, COACH, SCHEDULE_CHANGE, NO_ANSWER }

    /** {@code executionStatus}, on the header and each line. */
    public enum Execution { PLANNED, EXECUTED, SKIPPED }

    /** The header's and lines' timestamp: always milliseconds, so keys sort by time. */
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    public ChangeBatch {
        Objects.requireNonNull(batchId, "batchId");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(batchSource, "batchSource");
        Objects.requireNonNull(cancelledBy, "cancelledBy");
        Objects.requireNonNull(executionStatus, "executionStatus");
    }

    public static String stamp(Instant at) {
        return STAMP.format(at);
    }

    public String stamp() {
        return stamp(createdAt);
    }

    public String key() {
        return "CHANGEBATCH#" + stamp() + "#" + batchId;
    }

    public ChangeBatch executed(int lessons, int clients) {
        return new ChangeBatch(batchId, createdAt, batchSource, cancelledBy, actedBy, affectedFrom, affectedTo, lessons, clients,
                Execution.EXECUTED);
    }
}
