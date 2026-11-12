package com.bladebook.core.data;

import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.RepriceLine;
import com.bladebook.core.domain.Seat;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.Delete;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;
import software.amazon.awssdk.services.dynamodb.model.Update;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A schedule change's batch (ADR-MASTER section 9, "Execution"): the header written {@code WRITING}, every cancel and
 * re-price line written {@code PLANNED}, the header {@code COMPLETE}; then each lesson carried out in its own
 * transaction, its lines marked {@code EXECUTED} in that transaction or {@code SKIPPED} with the reason; the header
 * {@code EXECUTED} last. Every write is conditional on what was read.
 */
public final class ChangeBatchRepository {

    /** What a schedule-change batch looks like now, for the save status. */
    public record Latest(ChangeBatch batch, String planStatus, List<CancellationLine> passed) {
    }

    private final TenantClients clients;
    private final String table;

    public ChangeBatchRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    public void begin(AccessContext ctx, ChangeBatch planned) {
        db(ctx).putItem(b -> b.tableName(table).item(CancellationItems.header(ctx.coachId(), planned, "WRITING"))
                .conditionExpression("attribute_not_exists(SK)"));
    }

    /** Every line, {@code PLANNED}; then the header {@code COMPLETE}: nothing is carried out before that. */
    public void plan(AccessContext ctx, ChangeBatch batch, List<CancellationLine> cancels, List<RepriceLine> reprices) {
        List<Map<String, AttributeValue>> items = new ArrayList<>();
        cancels.forEach(l -> items.add(CancellationItems.line(ctx.coachId(), l)));
        reprices.forEach(l -> items.add(CancellationItems.reprice(ctx.coachId(), l)));
        for (Map<String, AttributeValue> item : items) {
            db(ctx).putItem(b -> b.tableName(table).item(item));
        }
        db(ctx).putItem(b -> b.tableName(table).item(CancellationItems.header(ctx.coachId(), batch, "COMPLETE")));
    }

    /**
     * Cancels one booked lesson time: its seats deleted as read, the lesson time deleted (or, when the new schedule
     * makes a different lesson at the same start, replaced by that open time), and its lines marked {@code EXECUTED}.
     */
    public boolean cancel(AccessContext ctx, LessonTime time, List<Seat> seats, LessonTime replacement, List<String> lineKeys, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        for (Seat s : seats) {
            items.add(TransactWriteItem.builder().delete(Delete.builder().tableName(table)
                    .key(FamilyItems.key("COACH#" + ctx.coachId(), s.key()))
                    .conditionExpression("seatStatus = :st AND joinedAt = :j AND startsAtUtc > :now")
                    .expressionAttributeValues(Map.of(":st", FamilyItems.s(s.seatStatus().name()), ":j", FamilyItems.s(s.joinedAt().toString()),
                            ":now", FamilyItems.s(seconds(now)))).build()).build());
        }
        Map<String, AttributeValue> v = Map.of(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()),
                ":n", AttributeValue.fromN(Integer.toString(seats.size())), ":now", FamilyItems.s(seconds(now)));
        String cond = "lessonStatus = :booked AND seatsTaken = :n AND startsAtUtc > :now";
        if (replacement == null) {
            items.add(TransactWriteItem.builder().delete(Delete.builder().tableName(table)
                    .key(FamilyItems.key("COACH#" + ctx.coachId(), time.key())).conditionExpression(cond).expressionAttributeValues(v).build()).build());
        } else {
            items.add(TransactWriteItem.builder().put(Put.builder().tableName(table).item(ScheduleRepository.lessonItem(ctx, replacement))
                    .conditionExpression(cond).expressionAttributeValues(v).build()).build());
        }
        lineKeys.forEach(k -> items.add(executed(ctx, k)));
        return write(db(ctx), items);
    }

    /** Re-prices one booked lesson time, if it's still booked at the price read, and marks its lines {@code EXECUTED}. */
    public boolean reprice(AccessContext ctx, LessonTime time, int newPriceMinor, List<String> lineKeys, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table)
                .key(FamilyItems.key("COACH#" + ctx.coachId(), time.key()))
                .conditionExpression("lessonStatus = :booked AND priceMinor = :old AND startsAtUtc > :now")
                .updateExpression("SET priceMinor = :new")
                .expressionAttributeValues(Map.of(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()),
                        ":old", AttributeValue.fromN(Integer.toString(time.priceMinor())),
                        ":new", AttributeValue.fromN(Integer.toString(newPriceMinor)), ":now", FamilyItems.s(seconds(now)))).build()).build());
        lineKeys.forEach(k -> items.add(executed(ctx, k)));
        return write(db(ctx), items);
    }

    /** Lines that won't be carried out, with why: {@code BOOKING_GONE}, {@code NO_LONGER_NEEDED} or {@code LESSON_PASSED}. */
    public void skip(AccessContext ctx, List<String> lineKeys, String reason) {
        for (String k : lineKeys) {
            db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key("COACH#" + ctx.coachId(), k))
                    .updateExpression("SET executionStatus = :sk, skippedReason = :r")
                    .expressionAttributeValues(Map.of(":sk", FamilyItems.s(ChangeBatch.Execution.SKIPPED.name()), ":r", FamilyItems.s(reason)))
                    .build());
        }
    }

    public void finish(AccessContext ctx, ChangeBatch executed) {
        db(ctx).putItem(b -> b.tableName(table).item(CancellationItems.header(ctx.coachId(), executed, "COMPLETE")));
    }

    /** The newest schedule-change batch (the weekly schedule or a dated one), with any lines skipped as passed. */
    public Optional<Latest> latest(AccessContext ctx) {
        Map<String, AttributeValue> found = null;
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true).scanIndexForward(false)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :p)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()), ":p", FamilyItems.s(CancellationItems.BATCH)))
                    .exclusiveStartKey(start).build());
            for (Map<String, AttributeValue> m : r.items()) {
                String source = FamilyItems.str(m, "batchSource");
                if ("DEFAULT".equals(source) || "DATE_OVERRIDE".equals(source)) {
                    found = m;
                    break;
                }
            }
            start = found == null && r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        if (found == null) {
            return Optional.empty();
        }
        ChangeBatch b = CancellationItems.batch(found);
        List<CancellationLine> passed = new ArrayList<>();
        for (Map<String, AttributeValue> m : query(ctx, CancellationItems.LINE + b.stamp() + "#" + b.batchId())) {
            if ("LESSON_PASSED".equals(FamilyItems.str(m, "skippedReason"))) {
                passed.add(CancellationItems.lineFrom(m));
            }
        }
        return Optional.of(new Latest(b, FamilyItems.str(found, "planStatus"), passed));
    }

    /** The batch's re-price lines, oldest first. */
    public List<RepriceLine> reprices(AccessContext ctx) {
        return query(ctx, CancellationItems.REPRICED).stream().map(CancellationItems::repriceFrom).toList();
    }

    // ------------------------------------------------------------------ helpers

    private TransactWriteItem executed(AccessContext ctx, String lineKey) {
        return TransactWriteItem.builder().update(Update.builder().tableName(table).key(FamilyItems.key("COACH#" + ctx.coachId(), lineKey))
                .conditionExpression("executionStatus = :planned").updateExpression("SET executionStatus = :done")
                .expressionAttributeValues(Map.of(":planned", FamilyItems.s(ChangeBatch.Execution.PLANNED.name()),
                        ":done", FamilyItems.s(ChangeBatch.Execution.EXECUTED.name()))).build()).build();
    }

    private static boolean write(DynamoDbClient db, List<TransactWriteItem> items) {
        try {
            db.transactWriteItems(TransactWriteItemsRequest.builder().transactItems(items).build());
            return true;
        } catch (TransactionCanceledException e) {
            if (!e.hasCancellationReasons() || e.cancellationReasons().stream().noneMatch(r -> "ConditionalCheckFailed".equals(r.code()))) {
                throw e;
            }
            return false;
        }
    }

    private List<Map<String, AttributeValue>> query(AccessContext ctx, String prefix) {
        List<Map<String, AttributeValue>> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :p)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()), ":p", FamilyItems.s(prefix)))
                    .exclusiveStartKey(start).build());
            out.addAll(r.items());
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    private static String seconds(Instant now) {
        return now.truncatedTo(ChronoUnit.SECONDS).toString();
    }

    private DynamoDbClient db(AccessContext ctx) {
        return clients.clientFor(ctx);
    }
}
