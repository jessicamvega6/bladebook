package com.bladebook.core.data;

import com.bladebook.core.domain.Seat;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Attendance on seats, in the coach's partition (ADR-MASTER section 11). Capture is a conditional write: the seat must
 * still be {@code BOOKED}, so a replay of something already recorded fails the condition and is reported as already
 * recorded, and one onto a cancelled seat finds no seat. Correction (the coach website's Lessons page) overwrites on
 * purpose, without that condition.
 */
public final class AttendanceRepository {

    public enum Capture { RECORDED, ALREADY_RECORDED, GONE }

    /** A seat with its outcome's tap time ({@code null} until something is recorded). */
    public record SeatOutcome(Seat seat, Instant outcomeAt) {
    }

    private final TenantClients clients;
    private final String table;

    public AttendanceRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /** Records present or absent on a seat still {@code BOOKED}: {@code outcomeAt} the tap time, {@code recordedAt} now. */
    public Capture capture(AccessContext ctx, String seatKey, Seat.Status outcome, Instant outcomeAt, Instant now) {
        try {
            db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), seatKey))
                    .conditionExpression("seatStatus = :booked")
                    .updateExpression("SET seatStatus = :st, outcomeAt = :at, recordedAt = :now")
                    .expressionAttributeValues(Map.of(":booked", FamilyItems.s(Seat.Status.BOOKED.name()), ":st", FamilyItems.s(outcome.name()),
                            ":at", FamilyItems.s(outcomeAt.toString()), ":now", FamilyItems.s(now.toString()))).build());
            return Capture.RECORDED;
        } catch (ConditionalCheckFailedException e) {
            Map<String, AttributeValue> m = db(ctx).getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                    .key(FamilyItems.key(ctx.partitionKey(), seatKey)).build()).item();
            return m == null || m.isEmpty() ? Capture.GONE : Capture.ALREADY_RECORDED;
        }
    }

    /** The Lessons page's correction: overwrites whatever was recorded. False if the seat no longer exists. */
    public boolean correct(AccessContext ctx, String seatKey, Seat.Status outcome, Instant now) {
        try {
            db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), seatKey))
                    .conditionExpression("attribute_exists(SK) AND seatStatus IN (:booked, :in, :no)")
                    .updateExpression("SET seatStatus = :st, recordedAt = :now, outcomeAt = if_not_exists(outcomeAt, :now)")
                    .expressionAttributeValues(Map.of(":booked", FamilyItems.s("BOOKED"), ":in", FamilyItems.s("CHECKED_IN"),
                            ":no", FamilyItems.s("NO_SHOW"), ":st", FamilyItems.s(outcome.name()), ":now", FamilyItems.s(now.toString()))).build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /** Seats from {@code from} to {@code to} inclusive, in key order, with their outcome times. */
    public List<SeatOutcome> seats(AccessContext ctx, LocalDate from, LocalDate to) {
        List<SeatOutcome> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND SK BETWEEN :a AND :b")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()),
                            ":a", FamilyItems.s(SeatItems.SEAT + from), ":b", FamilyItems.s(SeatItems.SEAT + to + "#~")))
                    .exclusiveStartKey(start).build());
            for (Map<String, AttributeValue> m : r.items()) {
                out.add(new SeatOutcome(SeatItems.seat(m), m.containsKey("outcomeAt") ? Instant.parse(m.get("outcomeAt").s()) : null));
            }
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    private DynamoDbClient db(AccessContext ctx) {
        return clients.clientFor(ctx);
    }
}
