package com.bladebook.core.data;

import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Change-batch headers and cancellation lines as DynamoDB attributes (ADR-MASTER section 3). Both live in the coach's
 * partition. {@code planStatus} is always {@code COMPLETE} here: the API writes the whole of a cancel as it goes,
 * and only the schedule-change consumer plans first (section 9).
 */
final class CancellationItems {

    static final String BATCH = "CHANGEBATCH#";
    static final String LINE = "CANCELLED#";

    private CancellationItems() {
    }

    static Map<String, AttributeValue> header(String coachId, ChangeBatch b) {
        Map<String, AttributeValue> m = new HashMap<>(FamilyItems.key("COACH#" + coachId, b.key()));
        m.put("batchId", FamilyItems.s(b.batchId()));
        m.put("createdAt", FamilyItems.s(b.createdAt().toString()));
        m.put("batchSource", FamilyItems.s(b.batchSource().name()));
        m.put("cancelledBy", FamilyItems.s(b.cancelledBy().name()));
        m.put("actedBy", FamilyItems.s(b.actedBy()));
        if (b.affectedFrom() != null) {
            m.put("affectedFrom", FamilyItems.s(b.affectedFrom().toString()));
            m.put("affectedTo", FamilyItems.s(b.affectedTo().toString()));
        }
        m.put("lessonCount", n(b.lessonCount()));
        m.put("clientCount", n(b.clientCount()));
        m.put("planStatus", FamilyItems.s("COMPLETE"));
        m.put("executionStatus", FamilyItems.s(b.executionStatus().name()));
        return m;
    }

    static ChangeBatch batch(Map<String, AttributeValue> m) {
        return new ChangeBatch(FamilyItems.str(m, "batchId"), Instant.parse(FamilyItems.str(m, "createdAt")),
                ChangeBatch.Source.valueOf(FamilyItems.str(m, "batchSource")), ChangeBatch.By.valueOf(FamilyItems.str(m, "cancelledBy")),
                FamilyItems.str(m, "actedBy"),
                m.containsKey("affectedFrom") ? LocalDate.parse(FamilyItems.str(m, "affectedFrom")) : null,
                m.containsKey("affectedTo") ? LocalDate.parse(FamilyItems.str(m, "affectedTo")) : null,
                i(m, "lessonCount"), i(m, "clientCount"), ChangeBatch.Execution.valueOf(FamilyItems.str(m, "executionStatus")));
    }

    static Map<String, AttributeValue> line(String coachId, CancellationLine l) {
        Map<String, AttributeValue> m = new HashMap<>(FamilyItems.key("COACH#" + coachId, l.key()));
        m.put("batchId", FamilyItems.s(l.batchId()));
        m.put("batchStamp", FamilyItems.s(l.batchStamp()));
        m.put("seatKey", FamilyItems.s(l.seatKey()));
        m.put("lessonDate", FamilyItems.s(l.lessonDate().toString()));
        m.put("startTime", FamilyItems.s(l.startTime().toString()));
        m.put("durationMinutes", n(l.durationMinutes()));
        m.put("priceMinor", n(l.priceMinor()));
        m.put("currency", FamilyItems.s(l.currency()));
        m.put("studentId", FamilyItems.s(l.studentId()));
        m.put("studentName", FamilyItems.s(l.studentName()));
        m.put("clientId", FamilyItems.s(l.clientId()));
        m.put("cancelledBy", FamilyItems.s(l.cancelledBy().name()));
        m.put("cancelledAt", FamilyItems.s(l.cancelledAt().toString()));
        m.put("noticeHours", n(l.noticeHours()));
        m.put("executionStatus", FamilyItems.s(l.executionStatus().name()));
        return m;
    }

    static CancellationLine lineFrom(Map<String, AttributeValue> m) {
        return new CancellationLine(FamilyItems.str(m, "batchId"), FamilyItems.str(m, "batchStamp"), FamilyItems.str(m, "seatKey"),
                LocalDate.parse(FamilyItems.str(m, "lessonDate")), LocalTime.parse(FamilyItems.str(m, "startTime")),
                i(m, "durationMinutes"), i(m, "priceMinor"), FamilyItems.str(m, "currency"), FamilyItems.str(m, "studentId"),
                FamilyItems.str(m, "studentName"), FamilyItems.str(m, "clientId"), ChangeBatch.By.valueOf(FamilyItems.str(m, "cancelledBy")),
                Instant.parse(FamilyItems.str(m, "cancelledAt")), Long.parseLong(m.get("noticeHours").n()),
                ChangeBatch.Execution.valueOf(FamilyItems.str(m, "executionStatus")));
    }

    private static AttributeValue n(long v) {
        return AttributeValue.fromN(Long.toString(v));
    }

    private static int i(Map<String, AttributeValue> m, String k) {
        return Integer.parseInt(m.get(k).n());
    }
}
