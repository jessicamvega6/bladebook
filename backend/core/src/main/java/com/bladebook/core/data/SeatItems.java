package com.bladebook.core.data;

import com.bladebook.core.domain.Seat;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;

/**
 * A seat as DynamoDB attributes (ADR-031 decision 2): {@code COACH#<coachId> / SEAT#<date>#<startTime>#<studentId>},
 * with GSI1 by client ({@code GSI1PK = CLIENT#<clientId>}, {@code GSI1SK = SEAT#<date>#<startTime>}) for the
 * family's own seats. GSI2 (by date, for the 7am and 9pm jobs) and GSI3 (unpaid) are added by the batches that
 * read them.
 */
final class SeatItems {

    static final String SEAT = "SEAT#";

    private SeatItems() {
    }

    static Map<String, AttributeValue> item(Seat s) {
        Map<String, AttributeValue> m = new HashMap<>(FamilyItems.key("COACH#" + s.coachId(), s.key()));
        m.put("GSI1PK", FamilyItems.s("CLIENT#" + s.clientId()));
        m.put("GSI1SK", FamilyItems.s(SEAT + s.lessonDate() + "#" + s.startTime()));
        m.put("lessonDate", FamilyItems.s(s.lessonDate().toString()));
        m.put("startTime", FamilyItems.s(s.startTime().toString()));
        m.put("studentId", FamilyItems.s(s.studentId()));
        m.put("clientId", FamilyItems.s(s.clientId()));
        m.put("studentName", FamilyItems.s(s.studentName()));
        m.put("seatStatus", FamilyItems.s(s.seatStatus().name()));
        m.put("startsAtUtc", FamilyItems.s(s.startsAtUtc().toString()));
        m.put("coachTz", FamilyItems.s(s.coachTz()));
        m.put("durationMinutes", AttributeValue.fromN(Integer.toString(s.durationMinutes())));
        m.put("joinedAt", FamilyItems.s(s.joinedAt().toString()));
        m.put("idempotencyKey", FamilyItems.s(s.idempotencyKey()));
        return m;
    }

    static Seat seat(Map<String, AttributeValue> m) {
        return new Seat(m.get("PK").s().substring("COACH#".length()), LocalDate.parse(FamilyItems.str(m, "lessonDate")),
                LocalTime.parse(FamilyItems.str(m, "startTime")), FamilyItems.str(m, "studentId"), FamilyItems.str(m, "clientId"),
                FamilyItems.str(m, "studentName"), Seat.Status.valueOf(FamilyItems.str(m, "seatStatus")),
                Instant.parse(FamilyItems.str(m, "startsAtUtc")), FamilyItems.str(m, "coachTz"),
                Integer.parseInt(m.get("durationMinutes").n()), Instant.parse(FamilyItems.str(m, "joinedAt")),
                FamilyItems.str(m, "idempotencyKey"));
    }
}
