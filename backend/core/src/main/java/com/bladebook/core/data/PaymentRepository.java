package com.bladebook.core.data;

import com.bladebook.core.domain.Payment;
import com.bladebook.core.domain.Seat;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Payment on seats, in the coach's partition (ADR-MASTER section 12). Each write is conditional on the status the
 * coach saw, so two windows can't, say, pay a lesson the other just waived. {@code paidVia} is stored on the seat, so
 * a payment type switched off later doesn't change past records.
 */
public final class PaymentRepository {

    /** A seat with its payment as stored. {@code paidVia} only when paid. */
    public record PaidSeat(Seat seat, Payment.Status status, Payment.Via paidVia) {
    }

    private final TenantClients clients;
    private final String table;

    public PaymentRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /** Seats from {@code from} to {@code to} inclusive, in key order. */
    public List<PaidSeat> seats(AccessContext ctx, LocalDate from, LocalDate to) {
        List<PaidSeat> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND SK BETWEEN :a AND :b")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()),
                            ":a", FamilyItems.s(SeatItems.SEAT + from), ":b", FamilyItems.s(SeatItems.SEAT + to + "#~")))
                    .exclusiveStartKey(start).build());
            for (Map<String, AttributeValue> m : r.items()) {
                out.add(new PaidSeat(SeatItems.seat(m), Payment.of(FamilyItems.str(m, "paymentStatus")),
                        m.containsKey("paidVia") ? Payment.Via.valueOf(m.get("paidVia").s()) : null));
            }
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /** Marks paid (from unpaid, or paid again to change how): {@code paidAt}, {@code markedPaidBy} and {@code paidVia}. */
    public boolean markPaid(AccessContext ctx, String seatKey, Payment.Status was, Payment.Via via, Instant now) {
        Map<String, AttributeValue> v = new HashMap<>(Map.of(":paid", FamilyItems.s("PAID"), ":by", FamilyItems.s(ctx.coachId())));
        String set = "SET paymentStatus = :paid, markedPaidBy = :by";
        if (was != Payment.Status.PAID) {
            set += ", paidAt = :at";
            v.put(":at", FamilyItems.s(now.toString()));
        }
        String update = via == null ? set + " REMOVE paidVia, GSI3PK, GSI3SK" : set + ", paidVia = :via REMOVE GSI3PK, GSI3SK";
        if (via != null) {
            v.put(":via", FamilyItems.s(via.name()));
        }
        return update(ctx, seatKey, was, update, v);
    }

    /** Waives an unpaid lesson: final, with no amount. */
    public boolean waive(AccessContext ctx, String seatKey, Instant now) {
        return update(ctx, seatKey, Payment.Status.UNPAID, "SET paymentStatus = :w, waivedAt = :at, waivedBy = :by REMOVE paidVia, GSI3PK, GSI3SK",
                new HashMap<>(Map.of(":w", FamilyItems.s("WAIVED"), ":at", FamilyItems.s(now.toString()), ":by", FamilyItems.s(ctx.coachId()))));
    }

    /** A paid lesson back to unpaid. */
    public boolean undo(AccessContext ctx, String seatKey) {
        String[] k = seatKey.split("#"); // SEAT#<date>#<startTime>#<studentId>
        Map<String, AttributeValue> v = new HashMap<>(Map.of(":u", FamilyItems.s("UNPAID")));
        SeatItems.unpaidIndex(ctx.coachId(), java.time.LocalDate.parse(k[1]), k[3]).forEach((n, val) -> v.put(":" + n, val));
        return update(ctx, seatKey, Payment.Status.PAID,
                "SET paymentStatus = :u, GSI3PK = :GSI3PK, GSI3SK = :GSI3SK REMOVE paidAt, markedPaidBy, paidVia", v);
    }

    /** One conditional update: the seat must exist and still have the status the coach saw. */
    private boolean update(AccessContext ctx, String seatKey, Payment.Status was, String update, Map<String, AttributeValue> values) {
        String cond = "attribute_exists(SK) AND " + (was == Payment.Status.UNPAID
                ? "(attribute_not_exists(paymentStatus) OR paymentStatus = :was)" : "paymentStatus = :was");
        values.put(":was", FamilyItems.s(was.name()));
        try {
            db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), seatKey))
                    .conditionExpression(cond).updateExpression(update).expressionAttributeValues(values).build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    private DynamoDbClient db(AccessContext ctx) {
        return clients.clientFor(ctx);
    }
}
