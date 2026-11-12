package com.bladebook.core.data;

import com.bladebook.core.domain.AfterCancel;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelPlan;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.Delete;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
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
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Cancelling (ADR-MASTER sections 9 and 10). A seat that ends is moved, not kept: each cancelled seat is deleted
 * and its {@code CANCELLED#} line put in one transaction with the lesson time's change, so nothing is ever half
 * cancelled. Every write is conditional on what was read; a failed condition writes nothing and returns
 * {@code false}, and the caller reads again to say why.
 *
 * <p>The family path takes a {@link LinkedSkater} and touches only that skater's own seat. The coach path takes an
 * {@link AccessContext} and stays in the coach's own partition.
 */
public final class CancellationRepository {

    /** What the family's read of its own seat names (ADR-MASTER section 16). */
    private static final List<String> SEAT_FIELDS = List.of("PK", "lessonDate", "startTime", "studentId", "clientId",
            "studentName", "seatStatus", "startsAtUtc", "coachTz", "durationMinutes", "joinedAt", "idempotencyKey", "recurrenceId",
            "bookedIntervalWeeks");

    private final TenantClients clients;
    private final String table;

    public CancellationRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // --------------------------------------------------------------------- the family

    /** The family's own seat for one skater and time, read strongly consistent, or empty if there's none. */
    public Optional<Seat> ownSeat(ClientContext ctx, LinkedSkater skater, LocalDate date, LocalTime start) {
        Map<String, String> names = new HashMap<>();
        for (int i = 0; i < SEAT_FIELDS.size(); i++) {
            names.put("#a" + i, SEAT_FIELDS.get(i));
        }
        Map<String, AttributeValue> m = clients.clientFor(ctx, skater.coach()).getItem(GetItemRequest.builder().tableName(table)
                .consistentRead(true).key(FamilyItems.key("COACH#" + skater.coachId(), Seat.key(date, start, skater.studentId())))
                .projectionExpression(String.join(", ", names.keySet())).expressionAttributeNames(names)
                .build()).item();
        if (m == null || m.isEmpty() || !skater.clientId().equals(FamilyItems.str(m, "clientId"))) {
            return Optional.empty();
        }
        return Optional.of(SeatItems.seat(m));
    }

    /**
     * A family cancels one booked seat: the seat deleted (still theirs, still {@code BOOKED}, not started, the same
     * one that was read), its line and the batch header put, and the lesson time back to {@code OPEN} as its last
     * seat goes. Shared lessons, where a seat stays, come with Batch 11.
     */
    public boolean cancelByFamily(ClientContext ctx, LinkedSkater skater, ChangeBatch batch, Seat seat, CancellationLine line, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(deleteSeat(seat, now, ":c", skater.clientId()));
        items.add(lessonAfter(skater.coachId(), seat.lessonDate(), seat.startTime(), 1, AfterCancel.RELEASE, now));
        items.add(put(CancellationItems.header(skater.coachId(), batch)));
        items.add(put(CancellationItems.line(skater.coachId(), line)));
        return write(clients.clientFor(ctx, skater.coach()), items);
    }

    /**
     * One seat of a family's batch (a series change, ADR-MASTER section 10): the seat deleted, its line put, the lesson time
     * back to {@code OPEN}, in one transaction, with the batch's header written by {@link #startForFamily} and
     * {@link #finishForFamily}.
     */
    public boolean cancelSeatByFamily(ClientContext ctx, LinkedSkater skater, Seat seat, CancellationLine line, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(deleteSeat(seat, now, ":c", skater.clientId()));
        items.add(lessonAfter(skater.coachId(), seat.lessonDate(), seat.startTime(), 1, AfterCancel.RELEASE, now));
        items.add(put(CancellationItems.line(skater.coachId(), line)));
        return write(clients.clientFor(ctx, skater.coach()), items);
    }

    /** A family's batch header, {@code PLANNED}, in the coach's partition. */
    public void startForFamily(ClientContext ctx, LinkedSkater skater, ChangeBatch planned) {
        clients.clientFor(ctx, skater.coach()).putItem(b -> b.tableName(table).item(CancellationItems.header(skater.coachId(), planned))
                .conditionExpression("attribute_not_exists(SK)"));
    }

    public void finishForFamily(ClientContext ctx, LinkedSkater skater, ChangeBatch executed) {
        clients.clientFor(ctx, skater.coach()).putItem(b -> b.tableName(table).item(CancellationItems.header(skater.coachId(), executed)));
    }

    // ---------------------------------------------------------------------- the coach

    /**
     * One lesson the coach cancels, in its own transaction: every seat in it deleted (as read), a line for each
     * booked seat, and the lesson time released or held. An unanswered invitation is deleted with no line (S11).
     *
     * @param header put in the same transaction when the whole batch is this one lesson; otherwise {@code null}
     */
    public boolean cancelByCoach(AccessContext ctx, ChangeBatch batch, CoachCancelPlan.Cancel cancel, List<CancellationLine> lines,
                                 ChangeBatch header, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        for (Seat s : cancel.seats()) {
            items.add(deleteSeat(s, now, null, null));
        }
        items.add(lessonAfter(ctx.coachId(), cancel.time().lessonDate(), cancel.time().startTime(), cancel.seats().size(),
                cancel.after(), now));
        lines.forEach(l -> items.add(put(CancellationItems.line(ctx.coachId(), l))));
        if (header != null) {
            items.add(put(CancellationItems.header(ctx.coachId(), header)));
        }
        return write(clients.clientFor(ctx), items);
    }

    /** Cancel rest of week: an open time that hasn't started becomes {@code HELD}, if it's still open and empty. */
    public boolean holdOpen(AccessContext ctx, LessonTime time, Instant now) {
        Map<String, AttributeValue> v = new HashMap<>();
        v.put(":open", FamilyItems.s(LessonTime.Status.OPEN.name()));
        v.put(":held", FamilyItems.s(LessonTime.Status.HELD.name()));
        v.put(":zero", AttributeValue.fromN("0"));
        v.put(":now", FamilyItems.s(seconds(now)));
        try {
            clients.clientFor(ctx).updateItem(UpdateItemRequest.builder().tableName(table)
                    .key(FamilyItems.key("COACH#" + ctx.coachId(), time.key()))
                    .conditionExpression("lessonStatus = :open AND seatsTaken = :zero AND startsAtUtc > :now")
                    .updateExpression("SET lessonStatus = :held").expressionAttributeValues(v).build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /** A batch larger than one lesson: the header first, {@code PLANNED}, then each lesson, then {@link #finish}. */
    public void start(AccessContext ctx, ChangeBatch planned) {
        clients.clientFor(ctx).putItem(b -> b.tableName(table).item(CancellationItems.header(ctx.coachId(), planned))
                .conditionExpression("attribute_not_exists(SK)"));
    }

    /** The header marked {@code EXECUTED} last, with what was actually done. */
    public void finish(AccessContext ctx, ChangeBatch executed) {
        clients.clientFor(ctx).putItem(b -> b.tableName(table).item(CancellationItems.header(ctx.coachId(), executed)));
    }

    /** The coach's change-batch headers, oldest first. */
    public List<ChangeBatch> batches(AccessContext ctx) {
        return query(ctx, CancellationItems.BATCH).stream().map(CancellationItems::batch).toList();
    }

    /** The coach's cancellation lines, oldest first. */
    public List<CancellationLine> lines(AccessContext ctx) {
        return query(ctx, CancellationItems.LINE).stream().map(CancellationItems::lineFrom).toList();
    }

    // --------------------------------------------------------------------- helpers

    /** Delete one seat as it was read: same status and join time, and not started. Optionally still the family's. */
    private TransactWriteItem deleteSeat(Seat s, Instant now, String clientParam, String clientId) {
        Map<String, AttributeValue> v = new HashMap<>();
        v.put(":st", FamilyItems.s(s.seatStatus().name()));
        v.put(":joined", FamilyItems.s(s.joinedAt().toString()));
        v.put(":now", FamilyItems.s(seconds(now)));
        String cond = "seatStatus = :st AND joinedAt = :joined AND startsAtUtc > :now";
        if (clientParam != null) {
            v.put(clientParam, FamilyItems.s(clientId));
            cond += " AND clientId = " + clientParam;
        }
        return TransactWriteItem.builder().delete(Delete.builder().tableName(table)
                .key(FamilyItems.key("COACH#" + s.coachId(), s.key())).conditionExpression(cond)
                .expressionAttributeValues(v).build()).build();
    }

    /** The lesson time once {@code leaving} seats have gone, all of them: released ({@code OPEN}) or held. */
    private TransactWriteItem lessonAfter(String coachId, LocalDate date, LocalTime start, int leaving, AfterCancel after, Instant now) {
        Map<String, AttributeValue> v = new HashMap<>();
        v.put(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()));
        v.put(":n", AttributeValue.fromN(Integer.toString(leaving)));
        v.put(":now", FamilyItems.s(seconds(now)));
        v.put(":after", FamilyItems.s(after.lessonStatus(0).name()));
        v.put(":zero", AttributeValue.fromN("0"));
        v.put(":none", AttributeValue.fromL(List.of()));
        return TransactWriteItem.builder().update(Update.builder().tableName(table)
                .key(FamilyItems.key("COACH#" + coachId, LessonTime.key(date, start)))
                .conditionExpression("lessonStatus = :booked AND seatsTaken = :n AND startsAtUtc > :now")
                .updateExpression("SET lessonStatus = :after, seatsTaken = :zero, shareCount = :zero, joinOrder = :none")
                .expressionAttributeValues(v).build()).build();
    }

    private TransactWriteItem put(Map<String, AttributeValue> item) {
        return TransactWriteItem.builder().put(Put.builder().tableName(table).item(item)
                .conditionExpression("attribute_not_exists(SK)").build()).build();
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
            QueryResponse r = clients.clientFor(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :p)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()), ":p", FamilyItems.s(prefix)))
                    .exclusiveStartKey(start).build());
            out.addAll(r.items());
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /** Whole seconds: {@code startsAtUtc} text compares by time only at the same precision (as booking does). */
    private static String seconds(Instant now) {
        return now.truncatedTo(ChronoUnit.SECONDS).toString();
    }
}
