package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Objects;

/**
 * A change-batch header, {@code COACH#<coachId> / CHANGEBATCH#<isoTs>#<batchId>} (ADR-MASTER section 9,
 * "Change-batch records"). Every cancellation writes one, with a {@link CancellationLine} per seat; a
 * single-lesson cancel is a batch of one, written with its line already {@code EXECUTED}.
 *
 * <p>{@code notes} (Batch 13, not in the ADR's attribute list) carry what the change notifier needs that no line holds: for a
 * {@code NO_ANSWER} batch, who left and the answer-by time; for the staying family's "Cancel, no charge",
 * {@code kind = STAYING_CANCEL}, so that family is emailed the dates and the coach isn't.
 */
public record ChangeBatch(String batchId, Instant createdAt, Source batchSource, By cancelledBy, String actedBy,
                          LocalDate affectedFrom, LocalDate affectedTo, int lessonCount, int clientCount,
                          Execution executionStatus, Map<String, String> notes) {

    /** {@code notes.kind} on the staying family's "Cancel, no charge" batch. */
    public static final String STAYING_CANCEL = "STAYING_CANCEL";

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
        notes = notes == null ? Map.of() : Map.copyOf(notes);
    }

    public ChangeBatch(String batchId, Instant createdAt, Source batchSource, By cancelledBy, String actedBy, LocalDate affectedFrom,
                       LocalDate affectedTo, int lessonCount, int clientCount, Execution executionStatus) {
        this(batchId, createdAt, batchSource, cancelledBy, actedBy, affectedFrom, affectedTo, lessonCount, clientCount, executionStatus,
                Map.of());
    }

    public ChangeBatch withNotes(Map<String, String> more) {
        return new ChangeBatch(batchId, createdAt, batchSource, cancelledBy, actedBy, affectedFrom, affectedTo, lessonCount, clientCount,
                executionStatus, more);
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
                Execution.EXECUTED, notes);
    }
}
