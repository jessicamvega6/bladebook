package com.bladebook.core.data;

import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.WeeklySchedule;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.KeysAndAttributes;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.Select;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;
import software.amazon.awssdk.services.dynamodb.model.Update;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Booking, on the family path (ADR-MASTER sections 7 and 16). Every read of the coach's partition takes a
 * {@link LinkedCoach} and asks only for named attributes ({@code Select = SPECIFIC_ATTRIBUTES}), and returns
 * nothing unless the family is {@code ACTIVE} with that coach. Every write takes a {@link LinkedSkater}.
 * Nothing here asks for values back, on success or on a failed condition.
 *
 * <p>Lesson-time reads name only what availability needs, never a name or anything about who holds a time.
 * The family's only {@code SEAT#} reads are its own seat by key (retry attribution) and its own seats through
 * GSI1.
 */
public final class BookingRepository {

    /** The coach's name, clock and notice period: public profile fields (ADR-022's read allowlist). */
    public record CoachClock(String firstName, String lastName, String coachTimezone, int requiredNoticeHours) {
    }

    private static final String LESSON = "LESSON#";
    /** What a family's lesson-time read may name (ADR-MASTER section 16): never {@code pendingLeave}. */
    private static final List<String> TIME_FIELDS = List.of("lessonDate", "startTime", "startsAtUtc", "coachTz",
            "durationMinutes", "priceMinor", "currency", "lessonStatus", "shareCount", "joinOrder", "blockSeq", "requiredNoticeHours");

    private final TenantClients clients;
    private final String table;

    public BookingRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // ------------------------------------------------------------- the coach's side, read

    public Optional<CoachClock> coach(ClientContext ctx, LinkedCoach coach) {
        if (!coach.active()) {
            return Optional.empty();
        }
        Map<String, AttributeValue> m = db(ctx, coach).getItem(get(coach, "PROFILE",
                List.of("firstName", "lastName", "coachTimezone", "requiredNoticeHours"))).item();
        if (m == null || m.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new CoachClock(FamilyItems.str(m, "firstName"), FamilyItems.str(m, "lastName"),
                FamilyItems.str(m, "coachTimezone"), Integer.parseInt(m.get("requiredNoticeHours").n())));
    }

    /** Lesson times from {@code from} to {@code to} inclusive, in key order: free or taken, and the price. */
    public List<AvailableTime> times(ClientContext ctx, LinkedCoach coach, LocalDate from, LocalDate to) {
        if (!coach.active()) {
            return List.of();
        }
        List<AvailableTime> out = new ArrayList<>();
        for (Map<String, AttributeValue> m : range(ctx, coach, LESSON + from, LESSON + to + "#~", TIME_FIELDS)) {
            out.add(time(m));
        }
        return out;
    }

    /**
     * The lesson times at these keys ({@code LESSON#<date>#<startTime>}), by key: for pricing the family's own
     * lessons on My bookings. Read with the same named attributes as {@link #times}.
     */
    public Map<String, AvailableTime> timesAt(ClientContext ctx, LinkedCoach coach, Collection<String> keys) {
        Map<String, AvailableTime> out = new HashMap<>();
        if (!coach.active() || keys.isEmpty()) {
            return out;
        }
        Map<String, String> names = names(TIME_FIELDS);
        List<String> all = new ArrayList<>(new java.util.LinkedHashSet<>(keys));
        for (int i = 0; i < all.size(); i += 100) {
            List<Map<String, AttributeValue>> want = new ArrayList<>();
            for (String k : all.subList(i, Math.min(all.size(), i + 100))) {
                want.add(FamilyItems.key("COACH#" + coach.coachId(), k));
            }
            Map<String, KeysAndAttributes> request = Map.of(table, KeysAndAttributes.builder().keys(want).consistentRead(true)
                    .projectionExpression(String.join(", ", names.keySet())).expressionAttributeNames(names).build());
            while (request != null && !request.isEmpty()) {
                BatchGetItemResponse r = db(ctx, coach).batchGetItem(BatchGetItemRequest.builder().requestItems(request).build());
                r.responses().getOrDefault(table, List.of()).forEach(m -> {
                    AvailableTime t = time(m);
                    out.put(t.key(), t);
                });
                request = r.hasUnprocessedKeys() && !r.unprocessedKeys().isEmpty() ? r.unprocessedKeys() : null;
            }
        }
        return out;
    }

    /** The coach's weekly schedule, for the block names the booking page shows. */
    public Optional<WeeklySchedule> weekly(ClientContext ctx, LinkedCoach coach) {
        if (!coach.active()) {
            return Optional.empty();
        }
        Map<String, AttributeValue> m = db(ctx, coach).getItem(get(coach, ScheduleRepository.DEFAULT, List.of("days", "scheduleVersion"))).item();
        return m == null || m.isEmpty() ? Optional.empty() : Optional.of(ScheduleRepository.weekly(m));
    }

    /** Date overrides from {@code from} to {@code to}, by date. */
    public Map<LocalDate, List<ScheduleBlock>> overrides(ClientContext ctx, LinkedCoach coach, LocalDate from, LocalDate to) {
        Map<LocalDate, List<ScheduleBlock>> out = new HashMap<>();
        if (!coach.active()) {
            return out;
        }
        for (Map<String, AttributeValue> m : range(ctx, coach, ScheduleRepository.DATE + from, ScheduleRepository.DATE + to,
                List.of("SK", "blocks"))) {
            out.put(LocalDate.parse(m.get("SK").s().substring(ScheduleRepository.DATE.length())),
                    m.containsKey("blocks") ? ScheduleRepository.blocks(m.get("blocks")) : List.of());
        }
        return out;
    }

    // --------------------------------------------------------------------- booking

    /**
     * Books one time for one skater: one transaction that turns the lesson time from {@code OPEN} to {@code BOOKED}
     * (only if it hasn't started, has a place, and still has the start and length that were read) and puts the
     * seat if it doesn't exist. If the transaction fails, the family's own seat for that time is read to say why.
     *
     * @param time the lesson time as the family read it; its start, zone and length are copied onto the seat
     */
    public BookingOutcome book(ClientContext ctx, LinkedSkater skater, AvailableTime time, String idempotencyKey, Instant now) {
        Seat seat = Seat.booked(skater.coachId(), time, skater.studentId(), skater.clientId(), skater.studentName(), now, idempotencyKey);
        Map<String, AttributeValue> v = new HashMap<>();
        v.put(":open", FamilyItems.s(LessonTime.Status.OPEN.name()));
        v.put(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()));
        v.put(":start", FamilyItems.s(time.startsAtUtc().toString()));
        v.put(":len", AttributeValue.fromN(Integer.toString(time.durationMinutes())));
        // Whole seconds: Instant text sorts by time only at the same precision as startsAtUtc's.
        v.put(":now", FamilyItems.s(now.truncatedTo(ChronoUnit.SECONDS).toString()));
        v.put(":one", AttributeValue.fromN("1"));
        v.put(":me", AttributeValue.fromL(List.of(FamilyItems.s(skater.studentId()))));
        v.put(":none", AttributeValue.fromL(List.of()));
        TransactWriteItem lesson = TransactWriteItem.builder().update(Update.builder().tableName(table)
                .key(FamilyItems.key("COACH#" + skater.coachId(), time.key()))
                .conditionExpression("lessonStatus = :open AND startsAtUtc = :start AND durationMinutes = :len"
                        + " AND startsAtUtc > :now AND seatsTaken < maxSkaters")
                .updateExpression("SET lessonStatus = :booked, seatsTaken = seatsTaken + :one,"
                        + " shareCount = :one, joinOrder = list_append(if_not_exists(joinOrder, :none), :me)")
                .expressionAttributeValues(v).build()).build();
        TransactWriteItem put = TransactWriteItem.builder().put(Put.builder().tableName(table).item(SeatItems.item(seat))
                .conditionExpression("attribute_not_exists(SK)").build()).build();
        try {
            db(ctx, skater.coach()).transactWriteItems(TransactWriteItemsRequest.builder().transactItems(lesson, put).build());
            return BookingOutcome.BOOKED;
        } catch (TransactionCanceledException e) {
            if (!e.hasCancellationReasons() || e.cancellationReasons().stream().noneMatch(r -> "ConditionalCheckFailed".equals(r.code()))) {
                throw e;
            }
            return attribute(ctx, skater, time.lessonDate(), time.startTime(), idempotencyKey);
        }
    }

    /** Why a date didn't book, from the family's own seat for that skater and time, read strongly consistent. */
    public BookingOutcome attribute(ClientContext ctx, LinkedSkater skater, LocalDate date, LocalTime start, String idempotencyKey) {
        Map<String, AttributeValue> m = db(ctx, skater.coach()).getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(FamilyItems.key("COACH#" + skater.coachId(), Seat.key(date, start, skater.studentId())))
                .projectionExpression("#k").expressionAttributeNames(Map.of("#k", "idempotencyKey")).build()).item();
        boolean exists = m != null && !m.isEmpty();
        return BookingOutcome.afterFailure(exists, exists ? FamilyItems.str(m, "idempotencyKey") : null, idempotencyKey);
    }

    // ------------------------------------------------------------- the family's seats

    /**
     * The family's own seats with every coach, from {@code from} to {@code to} inclusive, through GSI1. An index
     * read can miss a seat made a second earlier (ADR-MASTER section 7); nothing booking-critical depends on it.
     */
    public List<Seat> familySeats(ClientContext ctx, LocalDate from, LocalDate to) {
        List<Seat> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = clients.clientFor(ctx).query(QueryRequest.builder().tableName(table).indexName(LocalTable.GSI1)
                    .keyConditionExpression("GSI1PK = :pk AND GSI1SK BETWEEN :a AND :b")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()),
                            ":a", FamilyItems.s(SeatItems.SEAT + from), ":b", FamilyItems.s(SeatItems.SEAT + to + "#~")))
                    .exclusiveStartKey(start).build());
            r.items().forEach(m -> out.add(SeatItems.seat(m)));
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    // --------------------------------------------------------------------- helpers

    private List<Map<String, AttributeValue>> range(ClientContext ctx, LinkedCoach coach, String from, String to, List<String> fields) {
        Map<String, String> names = names(fields);
        List<Map<String, AttributeValue>> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx, coach).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .select(Select.SPECIFIC_ATTRIBUTES).projectionExpression(String.join(", ", names.keySet()))
                    .expressionAttributeNames(names)
                    .keyConditionExpression("PK = :pk AND SK BETWEEN :a AND :b")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s("COACH#" + coach.coachId()),
                            ":a", FamilyItems.s(from), ":b", FamilyItems.s(to)))
                    .exclusiveStartKey(start).build());
            out.addAll(r.items());
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    private GetItemRequest get(LinkedCoach coach, String sk, List<String> fields) {
        Map<String, String> names = names(fields);
        return GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(FamilyItems.key("COACH#" + coach.coachId(), sk))
                .projectionExpression(String.join(", ", names.keySet())).expressionAttributeNames(names).build();
    }

    /** {@code #a0 -> lessonDate}, ...: every name goes through a placeholder, so none can collide with a reserved word. */
    private static Map<String, String> names(List<String> fields) {
        Map<String, String> out = new java.util.LinkedHashMap<>();
        for (int i = 0; i < fields.size(); i++) {
            out.put("#a" + i, fields.get(i));
        }
        return out;
    }

    private static AvailableTime time(Map<String, AttributeValue> m) {
        List<String> order = new ArrayList<>();
        if (m.containsKey("joinOrder")) {
            m.get("joinOrder").l().forEach(a -> order.add(a.s()));
        }
        return new AvailableTime(LocalDate.parse(FamilyItems.str(m, "lessonDate")), LocalTime.parse(FamilyItems.str(m, "startTime")),
                Instant.parse(FamilyItems.str(m, "startsAtUtc")), FamilyItems.str(m, "coachTz"), n(m, "durationMinutes"),
                n(m, "priceMinor"), FamilyItems.str(m, "currency"),
                LessonTime.Status.OPEN.name().equals(FamilyItems.str(m, "lessonStatus")),
                m.containsKey("shareCount") ? n(m, "shareCount") : 0, order, n(m, "blockSeq"), n(m, "requiredNoticeHours"));
    }

    private static int n(Map<String, AttributeValue> m, String k) {
        return Integer.parseInt(m.get(k).n());
    }

    private DynamoDbClient db(ClientContext ctx, LinkedCoach coach) {
        return clients.clientFor(ctx, coach);
    }
}
