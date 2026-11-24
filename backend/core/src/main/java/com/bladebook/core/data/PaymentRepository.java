package com.bladebook.core.data;

import com.bladebook.core.domain.Payment;
import com.bladebook.core.domain.Seat;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;
import software.amazon.awssdk.services.dynamodb.model.Update;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Payment on seats, in the coach's partition (ADR-MASTER section 12). Each write is conditional on the status the
 * coach saw, and on a paid lesson when it was marked paid and how, so two windows can't, say, pay a lesson the other
 * just waived, undo a payment the other made again after undoing the one this window showed, or put back how they paid
 * after the other changed it. {@code paidVia} is stored on the seat, so
 * a payment type switched off later doesn't change past records.
 */
public final class PaymentRepository {

    /** A seat with its payment as stored. {@code paidVia} and {@code paidAt} only when paid. */
    public record PaidSeat(Seat seat, Payment.Status status, Payment.Via paidVia, Instant paidAt) {
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
                        m.containsKey("paidVia") ? Payment.Via.valueOf(m.get("paidVia").s()) : null,
                        m.containsKey("paidAt") ? Instant.parse(m.get("paidAt").s()) : null));
            }
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /**
     * The date of the coach's oldest unpaid lesson, from the sparse unpaid index (GSI3, access pattern 11:
     * {@code GSI3PK = COACH#<coachId>}, {@code GSI3SK = UNPAID#<date>#<studentId>}, oldest first). Only the sort key is
     * read. The Today page's unpaid figure starts its range here (Batch 22). An index read is eventually consistent, so a
     * payment made a moment ago can still be on it; the seats themselves are then read consistently.
     */
    public Optional<LocalDate> oldestUnpaid(AccessContext ctx) {
        QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).indexName(LocalTable.GSI3)
                .keyConditionExpression("GSI3PK = :pk").expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey())))
                .projectionExpression("GSI3SK").limit(1).build());
        return r.items().stream().findFirst().map(m -> LocalDate.parse(m.get("GSI3SK").s().split("#")[1]));
    }

    /**
     * Marks paid (from unpaid, or paid again to change how): {@code paidAt}, {@code markedPaidBy} and {@code paidVia}.
     * {@code wasPaidAt} and {@code wasVia}: when the payment the coach saw was made and how; null when unpaid or not given.
     */
    public boolean markPaid(AccessContext ctx, String seatKey, Payment.Status was, Instant wasPaidAt, Payment.Via wasVia,
                            Payment.Via via, Instant now) {
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
        return update(ctx, seatKey, was, wasPaidAt, wasVia, update, v);
    }

    /** Waives an unpaid lesson: final, with no amount. */
    public boolean waive(AccessContext ctx, String seatKey, Instant now) {
        return update(ctx, seatKey, Payment.Status.UNPAID, null, null, "SET paymentStatus = :w, waivedAt = :at, waivedBy = :by REMOVE paidVia, GSI3PK, GSI3SK",
                new HashMap<>(Map.of(":w", FamilyItems.s("WAIVED"), ":at", FamilyItems.s(now.toString()), ":by", FamilyItems.s(ctx.coachId()))));
    }

    /** A paid lesson back to unpaid. {@code paidAt} and {@code paidVia}: the payment the coach saw. */
    public boolean undo(AccessContext ctx, String seatKey, Instant paidAt, Payment.Via paidVia) {
        return update(ctx, seatKey, Payment.Status.PAID, paidAt, paidVia, UNDO, undoValues(ctx, seatKey));
    }

    /**
     * A paid lesson back to unpaid when the year its payment counted in has closed (Batch 26): the seat and its
     * correction ({@code PAYCORRECTION#}) are written in one transaction, or neither is. Conditional on the payment the
     * coach saw, whose {@code paidAt} the correction's year was worked out from.
     */
    public boolean undo(AccessContext ctx, String seatKey, Instant paidAt, Payment.Via paidVia, FinancialRepository.Undone correction) {
        Map<String, AttributeValue> v = undoValues(ctx, seatKey);
        try {
            db(ctx).transactWriteItems(TransactWriteItemsRequest.builder().transactItems(
                    TransactWriteItem.builder().update(Update.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), seatKey))
                            .conditionExpression(condition(Payment.Status.PAID, paidAt, paidVia, v)).updateExpression(UNDO)
                            .expressionAttributeValues(v).build()).build(),
                    TransactWriteItem.builder().put(Put.builder().tableName(table).item(FinancialRepository.correctionItem(ctx, correction))
                            .conditionExpression("attribute_not_exists(SK)").build()).build()).build());
            return true;
        } catch (TransactionCanceledException e) {
            return false;
        }
    }

    private static final String UNDO = "SET paymentStatus = :u, GSI3PK = :GSI3PK, GSI3SK = :GSI3SK REMOVE paidAt, markedPaidBy, paidVia";

    private static Map<String, AttributeValue> undoValues(AccessContext ctx, String seatKey) {
        String[] k = seatKey.split("#"); // SEAT#<date>#<startTime>#<studentId>
        Map<String, AttributeValue> v = new HashMap<>(Map.of(":u", FamilyItems.s("UNPAID")));
        SeatItems.unpaidIndex(ctx.coachId(), java.time.LocalDate.parse(k[1]), k[3]).forEach((n, val) -> v.put(":" + n, val));
        return v;
    }

    /** One conditional update: the seat must exist and still have the status (and payment) the coach saw. */
    private boolean update(AccessContext ctx, String seatKey, Payment.Status was, Instant wasPaidAt, Payment.Via wasVia,
                           String update, Map<String, AttributeValue> values) {
        String cond = condition(was, wasPaidAt, wasVia, values);
        try {
            db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), seatKey))
                    .conditionExpression(cond).updateExpression(update).expressionAttributeValues(values).build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /**
     * The seat exists, with the status the coach saw and the payment they saw: {@code paidAt} and {@code paidVia} as they
     * were, or none.
     */
    private static String condition(Payment.Status was, Instant wasPaidAt, Payment.Via wasVia, Map<String, AttributeValue> values) {
        values.put(":was", FamilyItems.s(was.name()));
        String paid = wasPaidAt == null ? "attribute_not_exists(paidAt)" : "paidAt = :wasAt";
        if (wasPaidAt != null) {
            values.put(":wasAt", FamilyItems.s(wasPaidAt.toString()));
        }
        paid += wasVia == null ? " AND attribute_not_exists(paidVia)" : " AND paidVia = :wasVia";
        if (wasVia != null) {
            values.put(":wasVia", FamilyItems.s(wasVia.name()));
        }
        return "attribute_exists(SK) AND " + (was == Payment.Status.UNPAID
                ? "(attribute_not_exists(paymentStatus) OR paymentStatus = :was)" : "paymentStatus = :was") + " AND " + paid;
    }

    private DynamoDbClient db(AccessContext ctx) {
        return clients.clientFor(ctx);
    }
}
