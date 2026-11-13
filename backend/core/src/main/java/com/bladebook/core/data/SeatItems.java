package com.bladebook.core.data;

import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;

/**
 * A seat as DynamoDB attributes (ADR-031 decision 2): {@code COACH#<coachId> / SEAT#<date>#<startTime>#<studentId>},
 * with GSI1 by client ({@code GSI1PK = CLIENT#<clientId>}, {@code GSI1SK = SEAT#<date>#<startTime>}) for the
 * family's own seats. A new seat is {@code paymentStatus = UNPAID} (Batch 8). GSI2 (by date, for the 7am and 9pm
 * jobs) and GSI3 (unpaid, for the weekly reminder) are added by the batch that reads them.
 *
 * <p>An {@code INVITED} seat (Batch 11) has no {@code clientId} and no GSI1 keys until {@code consumer-invite} copies the
 * invited family's on; it carries the {@code EXPIRE} deadline on GSI4 ({@code GSI4PK = DUE}), due at the lesson's start.
 */
final class SeatItems {

    static final String SEAT = "SEAT#";

    private SeatItems() {
    }

    static Map<String, AttributeValue> item(Seat s) {
        Map<String, AttributeValue> m = new HashMap<>(FamilyItems.key("COACH#" + s.coachId(), s.key()));
        if (s.clientId() != null) {
            m.put("GSI1PK", FamilyItems.s("CLIENT#" + s.clientId()));
            m.put("GSI1SK", FamilyItems.s(SEAT + s.lessonDate() + "#" + s.startTime()));
            m.put("clientId", FamilyItems.s(s.clientId()));
        }
        if (s.seatStatus() == Seat.Status.INVITED) {
            m.put(DUE_PK, FamilyItems.s(DUE));
            m.put(DUE_SK, FamilyItems.s(Sharing.dueKey(s.startsAtUtc(), s.coachId(), s.key())));
            m.put("dueKind", FamilyItems.s(EXPIRE));
            m.put("dueAt", FamilyItems.s(s.startsAtUtc().toString()));
        }
        m.put("lessonDate", FamilyItems.s(s.lessonDate().toString()));
        m.put("startTime", FamilyItems.s(s.startTime().toString()));
        m.put("studentId", FamilyItems.s(s.studentId()));
        m.put("studentName", FamilyItems.s(s.studentName()));
        m.put("seatStatus", FamilyItems.s(s.seatStatus().name()));
        m.put("startsAtUtc", FamilyItems.s(s.startsAtUtc().toString()));
        m.put("coachTz", FamilyItems.s(s.coachTz()));
        m.put("durationMinutes", AttributeValue.fromN(Integer.toString(s.durationMinutes())));
        m.put("joinedAt", FamilyItems.s(s.joinedAt().toString()));
        m.put("idempotencyKey", FamilyItems.s(s.idempotencyKey()));
        m.put("paymentStatus", FamilyItems.s("UNPAID"));
        if (s.recurrenceId() != null) {
            m.put("recurrenceId", FamilyItems.s(s.recurrenceId()));
            m.put("bookedIntervalWeeks", AttributeValue.fromN(Integer.toString(s.bookedIntervalWeeks())));
        }
        Seat.Share sh = s.share();
        putIf(m, "inviteId", sh.inviteId());
        putIf(m, "invitedByClientId", sh.invitedByClientId());
        putIf(m, "invitedByName", sh.invitedByName());
        putIf(m, "invitedStudentId", sh.invitedStudentId());
        return m;
    }

    /** GSI4, the sweep's index (ADR-MASTER section 3): sparse, every deadline under one key. */
    static final String DUE_PK = "GSI4PK";
    static final String DUE_SK = "GSI4SK";
    static final String DUE = "DUE";
    static final String EXPIRE = "EXPIRE";
    static final String ANSWER = "ANSWER";

    private static void putIf(Map<String, AttributeValue> m, String k, String v) {
        if (v != null) {
            m.put(k, FamilyItems.s(v));
        }
    }

    static Seat seat(Map<String, AttributeValue> m) {
        return new Seat(m.get("PK").s().substring("COACH#".length()), LocalDate.parse(FamilyItems.str(m, "lessonDate")),
                LocalTime.parse(FamilyItems.str(m, "startTime")), FamilyItems.str(m, "studentId"), FamilyItems.str(m, "clientId"),
                FamilyItems.str(m, "studentName"), Seat.Status.valueOf(FamilyItems.str(m, "seatStatus")),
                Instant.parse(FamilyItems.str(m, "startsAtUtc")), FamilyItems.str(m, "coachTz"),
                Integer.parseInt(m.get("durationMinutes").n()), Instant.parse(FamilyItems.str(m, "joinedAt")),
                FamilyItems.str(m, "idempotencyKey"), FamilyItems.str(m, "recurrenceId"),
                m.containsKey("bookedIntervalWeeks") ? Integer.parseInt(m.get("bookedIntervalWeeks").n()) : 0,
                new Seat.Share(FamilyItems.str(m, "inviteId"), FamilyItems.str(m, "invitedByClientId"), FamilyItems.str(m, "invitedByName"),
                        FamilyItems.str(m, "invitedStudentId"), FamilyItems.str(m, "invitedClientId"), FamilyItems.str(m, "partnerName"),
                        FamilyItems.str(m, "partnerStatus"),
                        m.containsKey("choiceAnswerBy") ? Instant.parse(FamilyItems.str(m, "choiceAnswerBy")) : null,
                        m.containsKey("freedPlace") && Boolean.TRUE.equals(m.get("freedPlace").bool())));
    }
}
