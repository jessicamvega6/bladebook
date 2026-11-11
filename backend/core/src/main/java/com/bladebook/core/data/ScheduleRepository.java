package com.bladebook.core.data;

import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.WeeklySchedule;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.Delete;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The coach's schedule and lesson times, all in the coach's own partition (ADR-MASTER sections 3, 6, 7):
 * {@code SCHEDULE#DEFAULT}, {@code SCHEDULE#DATE#<date>} (read only until Batch 6 writes them),
 * {@code LESSON#<date>#<startTime>}, and, read only, the {@code SEAT#} items booking writes.
 *
 * <p>Lesson-time writes are conditional, so nothing a family has done since the read is undone: a time
 * is added only if it doesn't exist, and removed or replaced only while still in the status it was read
 * in. A write whose condition fails is skipped and counted.
 */
public final class ScheduleRepository {

    /** What {@link #apply} did. {@code skipped}: writes whose condition failed because the time changed since it was read. */
    public record Applied(int added, int removed, int replaced, int skipped) {
    }

    static final String DEFAULT = "SCHEDULE#DEFAULT";
    static final String DATE = "SCHEDULE#DATE#";
    static final String LESSON = "LESSON#";
    /** TransactWriteItems takes at most 100 writes. */
    static final int CHUNK = 100;

    private static final Map<DayOfWeek, String> DAY_KEYS = new EnumMap<>(Map.of(
            DayOfWeek.SUNDAY, "SUN", DayOfWeek.MONDAY, "MON", DayOfWeek.TUESDAY, "TUE", DayOfWeek.WEDNESDAY, "WED",
            DayOfWeek.THURSDAY, "THU", DayOfWeek.FRIDAY, "FRI", DayOfWeek.SATURDAY, "SAT"));

    private final TenantClients clients;
    private final String table;

    public ScheduleRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // ------------------------------------------------------- default schedule

    public Optional<WeeklySchedule> findDefault(AccessContext ctx) {
        Map<String, AttributeValue> item = db(ctx).getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(key(ctx, DEFAULT)).build()).item();
        if (item == null || item.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(weekly(item));
    }

    /** The {@code SCHEDULE#DEFAULT} item as a schedule. Also read on the family path, for block names. */
    static WeeklySchedule weekly(Map<String, AttributeValue> item) {
        Map<DayOfWeek, List<ScheduleBlock>> days = new EnumMap<>(DayOfWeek.class);
        Map<String, AttributeValue> stored = item.containsKey("days") ? item.get("days").m() : Map.of();
        DAY_KEYS.forEach((day, k) -> {
            if (stored.containsKey(k)) {
                days.put(day, blocks(stored.get(k)));
            }
        });
        return new WeeklySchedule(days, Long.parseLong(item.get("scheduleVersion").n()));
    }

    /**
     * Stores the default schedule. {@code schedule.scheduleVersion()} must be one above the version the
     * coach's editor read (1 for the first save), so a save from a stale window is refused.
     *
     * @throws DomainException CONFLICT if the stored version isn't the one before
     */
    public void saveDefault(AccessContext ctx, WeeklySchedule schedule) {
        Map<String, AttributeValue> item = new HashMap<>(key(ctx, DEFAULT));
        Map<String, AttributeValue> days = new LinkedHashMap<>();
        DAY_KEYS.forEach((day, k) -> {
            if (!schedule.blocksOn(day).isEmpty()) {
                days.put(k, blocksAttr(schedule.blocksOn(day)));
            }
        });
        item.put("days", AttributeValue.fromM(days));
        item.put("scheduleVersion", n(schedule.scheduleVersion()));
        PutItemRequest.Builder put = PutItemRequest.builder().tableName(table).item(item);
        if (schedule.scheduleVersion() <= 1) {
            put.conditionExpression("attribute_not_exists(SK)");
        } else {
            put.conditionExpression("scheduleVersion = :prev")
                    .expressionAttributeValues(Map.of(":prev", n(schedule.scheduleVersion() - 1)));
        }
        try {
            db(ctx).putItem(put.build());
        } catch (ConditionalCheckFailedException e) {
            throw DomainException.conflict("Your schedule changed in another window. Reload the page and try again.");
        }
    }

    // --------------------------------------------------------- date overrides

    /** Every {@code SCHEDULE#DATE#} item from {@code from} to {@code to}, by date. An empty list means no lessons. */
    public Map<LocalDate, List<ScheduleBlock>> overrides(AccessContext ctx, LocalDate from, LocalDate to) {
        Map<LocalDate, List<ScheduleBlock>> out = new HashMap<>();
        for (Map<String, AttributeValue> item : query(ctx, DATE + from, DATE + to)) {
            LocalDate date = LocalDate.parse(item.get("SK").s().substring(DATE.length()));
            out.put(date, item.containsKey("blocks") ? blocks(item.get("blocks")) : List.of());
        }
        return out;
    }

    // ----------------------------------------------------------- lesson times

    /** Lesson times from {@code from} to {@code to} inclusive, in key order. */
    public List<LessonTime> lessonTimes(AccessContext ctx, LocalDate from, LocalDate to) {
        List<LessonTime> out = new ArrayList<>();
        for (Map<String, AttributeValue> item : query(ctx, LESSON + from, LESSON + to + "#~")) {
            out.add(lessonFrom(item));
        }
        return out;
    }

    /**
     * The seats from {@code from} to {@code to} inclusive, in key order: who is booked, for the coach's calendars.
     * A separate {@code SEAT#} prefix keeps them out of the lesson-time query (ADR-031 decision 2).
     */
    public List<Seat> seats(AccessContext ctx, LocalDate from, LocalDate to) {
        List<Seat> out = new ArrayList<>();
        for (Map<String, AttributeValue> item : query(ctx, SeatItems.SEAT + from, SeatItems.SEAT + to + "#~")) {
            out.add(SeatItems.seat(item));
        }
        return out;
    }

    /** Carries out a plan's adds, removes and replaces, each under its condition, up to 100 per transaction. */
    public Applied apply(AccessContext ctx, ScheduleChange plan) {
        int[] done = new int[4]; // added, removed, replaced, skipped
        List<Write> writes = new ArrayList<>();
        for (LessonTime t : plan.add()) {
            writes.add(new Write(0, TransactWriteItem.builder().put(Put.builder().tableName(table).item(lessonItem(ctx, t))
                    .conditionExpression("attribute_not_exists(SK)").build()).build()));
        }
        for (LessonTime t : plan.remove()) {
            writes.add(new Write(1, TransactWriteItem.builder().delete(Delete.builder().tableName(table)
                    .key(key(ctx, t.key())).conditionExpression("lessonStatus = :s")
                    .expressionAttributeValues(Map.of(":s", s(t.lessonStatus().name()))).build()).build()));
        }
        for (LessonTime t : plan.replace()) {
            writes.add(new Write(2, TransactWriteItem.builder().put(Put.builder().tableName(table).item(lessonItem(ctx, t))
                    .conditionExpression("lessonStatus = :s")
                    .expressionAttributeValues(Map.of(":s", s(LessonTime.Status.OPEN.name()))).build()).build()));
        }
        for (int i = 0; i < writes.size(); i += CHUNK) {
            List<Write> chunk = writes.subList(i, Math.min(writes.size(), i + CHUNK));
            try {
                db(ctx).transactWriteItems(TransactWriteItemsRequest.builder()
                        .transactItems(chunk.stream().map(w -> w.item).toList()).build());
                chunk.forEach(w -> done[w.kind]++);
            } catch (TransactionCanceledException e) {
                // Something changed since the read: write this chunk one at a time, skipping what no longer fits.
                for (Write w : chunk) {
                    done[one(ctx, w.item) ? w.kind : 3]++;
                }
            }
        }
        return new Applied(done[0], done[1], done[2], done[3]);
    }

    private record Write(int kind, TransactWriteItem item) {
    }

    /** One conditional write. False if its condition failed. */
    private boolean one(AccessContext ctx, TransactWriteItem w) {
        try {
            if (w.put() != null) {
                db(ctx).putItem(PutItemRequest.builder().tableName(table).item(w.put().item())
                        .conditionExpression(w.put().conditionExpression())
                        .expressionAttributeValues(w.put().expressionAttributeValues().isEmpty() ? null : w.put().expressionAttributeValues())
                        .build());
            } else {
                db(ctx).deleteItem(DeleteItemRequest.builder().tableName(table).key(w.delete().key())
                        .conditionExpression(w.delete().conditionExpression())
                        .expressionAttributeValues(w.delete().expressionAttributeValues()).build());
            }
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- mapping

    static AttributeValue blocksAttr(List<ScheduleBlock> blocks) {
        List<AttributeValue> out = new ArrayList<>();
        for (ScheduleBlock b : blocks) {
            Map<String, AttributeValue> m = new HashMap<>();
            m.put("seq", n(b.seq()));
            if (b.blockName() != null) {
                m.put("blockName", s(b.blockName()));
            }
            m.put("startTime", s(b.startTime().toString()));
            m.put("endTime", s(b.endTime().toString()));
            m.put("lessonMinutes", n(b.lessonMinutes()));
            m.put("priceMinor", n(b.priceMinor()));
            m.put("missedLessonFeeMinor", n(b.missedLessonFeeMinor()));
            m.put("maxSkaters", n(b.maxSkaters()));
            m.put("iceType", s(b.iceType().name()));
            out.add(AttributeValue.fromM(m));
        }
        return AttributeValue.fromL(out);
    }

    static List<ScheduleBlock> blocks(AttributeValue list) {
        List<ScheduleBlock> out = new ArrayList<>();
        for (AttributeValue v : list.l()) {
            Map<String, AttributeValue> m = v.m();
            out.add(new ScheduleBlock(i(m, "seq"), m.containsKey("blockName") ? m.get("blockName").s() : null,
                    LocalTime.parse(m.get("startTime").s()), LocalTime.parse(m.get("endTime").s()), i(m, "lessonMinutes"),
                    i(m, "priceMinor"), i(m, "missedLessonFeeMinor"), i(m, "maxSkaters"), IceType.valueOf(m.get("iceType").s())));
        }
        return out;
    }

    private static Map<String, AttributeValue> lessonItem(AccessContext ctx, LessonTime t) {
        Map<String, AttributeValue> m = new HashMap<>(key(ctx, t.key()));
        m.put("lessonStatus", s(t.lessonStatus().name()));
        m.put("lessonDate", s(t.lessonDate().toString()));
        m.put("startTime", s(t.startTime().toString()));
        m.put("startsAtUtc", s(t.startsAtUtc().toString()));
        m.put("coachTz", s(t.coachTz()));
        m.put("durationMinutes", n(t.durationMinutes()));
        m.put("priceMinor", n(t.priceMinor()));
        m.put("currency", s(t.currency()));
        m.put("missedLessonFeeMinor", n(t.missedLessonFeeMinor()));
        m.put("requiredNoticeHours", n(t.requiredNoticeHours()));
        m.put("maxSkaters", n(t.maxSkaters()));
        m.put("seatsTaken", n(t.seatsTaken()));
        m.put("shareCount", n(0));
        m.put("blockSeq", n(t.blockSeq()));
        m.put("iceType", s(t.iceType().name()));
        m.put("scheduleVersion", n(t.scheduleVersion()));
        return m;
    }

    private static LessonTime lessonFrom(Map<String, AttributeValue> m) {
        return new LessonTime(LocalDate.parse(m.get("lessonDate").s()), LocalTime.parse(m.get("startTime").s()),
                Instant.parse(m.get("startsAtUtc").s()), m.get("coachTz").s(), i(m, "durationMinutes"), i(m, "priceMinor"),
                m.get("currency").s(), i(m, "missedLessonFeeMinor"), i(m, "requiredNoticeHours"), i(m, "maxSkaters"),
                i(m, "seatsTaken"), i(m, "blockSeq"), IceType.valueOf(m.get("iceType").s()),
                Long.parseLong(m.get("scheduleVersion").n()), LessonTime.Status.valueOf(m.get("lessonStatus").s()));
    }

    // ---------------------------------------------------------------- helpers

    private List<Map<String, AttributeValue>> query(AccessContext ctx, String from, String to) {
        List<Map<String, AttributeValue>> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND SK BETWEEN :a AND :b")
                    .expressionAttributeValues(Map.of(":pk", s(ctx.partitionKey()), ":a", s(from), ":b", s(to)))
                    .exclusiveStartKey(start).build());
            out.addAll(r.items());
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    private DynamoDbClient db(AccessContext ctx) {
        return clients.clientFor(ctx);
    }

    private static Map<String, AttributeValue> key(AccessContext ctx, String sk) {
        return Map.of("PK", s(ctx.partitionKey()), "SK", s(sk));
    }

    private static AttributeValue s(String v) {
        return AttributeValue.fromS(v);
    }

    private static AttributeValue n(long v) {
        return AttributeValue.fromN(Long.toString(v));
    }

    private static int i(Map<String, AttributeValue> m, String k) {
        return Integer.parseInt(m.get(k).n());
    }
}
