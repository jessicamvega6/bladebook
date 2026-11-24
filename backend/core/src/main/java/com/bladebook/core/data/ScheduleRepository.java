package com.bladebook.core.data;

import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.TempSchedule;
import com.bladebook.core.domain.WeeklySchedule;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionCheck;
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
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

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
 * {@code SCHEDULE#DEFAULT}, {@code SCHEDULE#DATE#<date>} and {@code SCHEDULE#TEMP#<tempId>} (time off and special
 * schedules, Batch 6),
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

    /** The change batches in this coach's partition, on the same table. */
    public ChangeBatchRepository changeBatches() {
        return new ChangeBatchRepository(clients, table);
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

    // ------------------------------------------- time off and special schedules

    static final String TEMP = "SCHEDULE#TEMP#";
    /** Date items per transaction: TransactWriteItems takes 100 (ADR-MASTER section 6 chunks past 99 days). */
    static final int DATE_CHUNK = 99;

    /** Every time off and special schedule, by start date. */
    public List<TempSchedule> temps(AccessContext ctx) {
        List<TempSchedule> out = new ArrayList<>();
        for (Map<String, AttributeValue> item : query(ctx, TEMP, TEMP + "~")) {
            out.add(tempFrom(item));
        }
        out.sort(java.util.Comparator.comparing(TempSchedule::startDate));
        return out;
    }

    public Optional<TempSchedule> temp(AccessContext ctx, String tempId) {
        Map<String, AttributeValue> m = db(ctx).getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(key(ctx, TempSchedule.key(tempId))).build()).item();
        return m == null || m.isEmpty() ? Optional.empty() : Optional.of(tempFrom(m));
    }

    /**
     * Saves time off or a special schedule: on an edit, the old version's date items the new one no longer has go first
     * (only those still carrying its {@code tempId}); then one date item per date, up to 99 per transaction, each written
     * only where no other one already has the date or it's this one's (an edited date is overwritten in place, never
     * missing part-way); then the header, last (ADR-MASTER section 6).
     *
     * @param previous the version opened for editing, or {@code null} for a new one
     * @throws DomainException CONFLICT if another time off or special schedule took one of the dates meanwhile
     */
    public void saveTemp(AccessContext ctx, TempSchedule t, TempSchedule previous) {
        if (previous != null) {
            for (LocalDate d : previous.dates()) {
                if (t.dateBlocks().containsKey(d)) {
                    continue; // rewritten in place below
                }
                try {
                    db(ctx).deleteItem(DeleteItemRequest.builder().tableName(table).key(key(ctx, DATE + d))
                            .conditionExpression("tempId = :id").expressionAttributeValues(Map.of(":id", s(previous.tempId()))).build());
                } catch (ConditionalCheckFailedException gone) {
                    // Already gone or someone else's: nothing to remove.
                }
            }
        }
        List<TransactWriteItem> writes = new ArrayList<>();
        t.dateBlocks().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> {
            Map<String, AttributeValue> item = new HashMap<>(key(ctx, DATE + e.getKey()));
            item.put("blocks", blocksAttr(e.getValue()));
            item.put("tempId", s(t.tempId()));
            writes.add(TransactWriteItem.builder().put(Put.builder().tableName(table).item(item)
                    .conditionExpression("attribute_not_exists(SK) OR tempId = :id")
                    .expressionAttributeValues(Map.of(":id", s(t.tempId()))).build()).build());
        });
        for (int i = 0; i < writes.size(); i += DATE_CHUNK) {
            try {
                db(ctx).transactWriteItems(TransactWriteItemsRequest.builder()
                        .transactItems(writes.subList(i, Math.min(writes.size(), i + DATE_CHUNK))).build());
            } catch (TransactionCanceledException e) {
                throw DomainException.conflict("Another time off or special schedule was saved on these dates. Reload the page and try again.");
            }
        }
        db(ctx).putItem(PutItemRequest.builder().tableName(table).item(tempItem(ctx, t)).build());
    }

    /**
     * Deletes time off or a special schedule: its date items (only those still carrying its {@code tempId}) first,
     * then its header (ADR-MASTER section 6). The weekly schedule applies to those dates again.
     */
    public void deleteTemp(AccessContext ctx, TempSchedule t) {
        for (LocalDate d : t.dates()) {
            try {
                db(ctx).deleteItem(DeleteItemRequest.builder().tableName(table).key(key(ctx, DATE + d))
                        .conditionExpression("tempId = :id").expressionAttributeValues(Map.of(":id", s(t.tempId()))).build());
            } catch (ConditionalCheckFailedException gone) {
                // Already gone or someone else's: nothing to remove.
            }
        }
        db(ctx).deleteItem(DeleteItemRequest.builder().tableName(table).key(key(ctx, t.key())).build());
    }

    private static Map<String, AttributeValue> tempItem(AccessContext ctx, TempSchedule t) {
        Map<String, AttributeValue> m = new HashMap<>(key(ctx, t.key()));
        m.put("tempId", s(t.tempId()));
        m.put("tempKind", s(t.kind().name()));
        m.put("scheduleName", s(t.name()));
        m.put("startDate", s(t.startDate().toString()));
        m.put("endDate", s(t.endDate().toString()));
        List<AttributeValue> templates = new ArrayList<>();
        for (BlockTemplate b : t.templates()) {
            Map<String, AttributeValue> x = new HashMap<>();
            x.put("seq", n(b.seq()));
            x.put("blockName", s(b.name()));
            x.put("startTime", s(b.startTime().toString()));
            x.put("endTime", s(b.effectiveEnd().toString()));
            x.put("lessonMinutes", n(b.lessonMinutes()));
            x.put("priceMinor", n(b.priceMinor()));
            x.put("maxSkaters", n(b.maxSkaters()));
            x.put("iceType", s(b.iceType().name()));
            Map<String, AttributeValue> off = new HashMap<>();
            t.off().getOrDefault(b.seq(), Map.of()).forEach((d, times) ->
                    off.put(d.toString(), AttributeValue.fromL(times.stream().sorted().map(tt -> s(tt.toString())).toList())));
            x.put("off", AttributeValue.fromM(off));
            templates.add(AttributeValue.fromM(x));
        }
        m.put("templates", AttributeValue.fromL(templates));
        return m;
    }

    private static TempSchedule tempFrom(Map<String, AttributeValue> m) {
        List<BlockTemplate> templates = new ArrayList<>();
        Map<Integer, Map<LocalDate, java.util.Set<LocalTime>>> off = new HashMap<>();
        if (m.containsKey("templates")) {
            for (AttributeValue v : m.get("templates").l()) {
                Map<String, AttributeValue> x = v.m();
                int seq = i(x, "seq");
                templates.add(new BlockTemplate(seq, x.get("blockName").s(), LocalTime.parse(x.get("startTime").s()),
                        LocalTime.parse(x.get("endTime").s()), i(x, "lessonMinutes"), i(x, "priceMinor"), i(x, "maxSkaters"),
                        IceType.valueOf(x.get("iceType").s()), java.util.Set.of(), Map.of()));
                Map<LocalDate, java.util.Set<LocalTime>> byDate = new HashMap<>();
                x.getOrDefault("off", AttributeValue.fromM(Map.of())).m().forEach((d, times) ->
                        byDate.put(LocalDate.parse(d), new java.util.HashSet<>(times.l().stream().map(tt -> LocalTime.parse(tt.s())).toList())));
                off.put(seq, byDate);
            }
        }
        return new TempSchedule(m.get("tempId").s(), TempSchedule.Kind.valueOf(m.get("tempKind").s()), m.get("scheduleName").s(),
                LocalDate.parse(m.get("startDate").s()), LocalDate.parse(m.get("endDate").s()), templates, off);
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

    /** What {@link #roll} did: times added, and whether some date's schedule changed since it was read (none put on it). */
    public record Rolled(int added, boolean stale) {
    }

    /**
     * The lesson roller's adds (ADR-MASTER section 14), one date at a time, each in a transaction with a check that the
     * schedule it was planned from is still as read: the date's {@code SCHEDULE#DATE#} item with the same blocks, or no
     * such item and {@code SCHEDULE#DEFAULT} at {@code defaultVersion} ({@code null}: none). So a time a schedule change
     * has just removed is never put back from an older read. A date whose check or put fails gets nothing; it's reported
     * {@code stale}.
     */
    public Rolled roll(AccessContext ctx, List<LessonTime> add, Long defaultVersion, Map<LocalDate, List<ScheduleBlock>> overrides) {
        Map<LocalDate, List<LessonTime>> byDate = new java.util.TreeMap<>();
        add.forEach(t -> byDate.computeIfAbsent(t.lessonDate(), d -> new ArrayList<>()).add(t));
        int added = 0;
        boolean stale = false;
        for (Map.Entry<LocalDate, List<LessonTime>> e : byDate.entrySet()) {
            List<TransactWriteItem> checks = plannedFrom(ctx, e.getKey(), defaultVersion, overrides.get(e.getKey()));
            List<LessonTime> times = e.getValue();
            int chunk = CHUNK - checks.size();
            for (int i = 0; i < times.size(); i += chunk) {
                List<TransactWriteItem> items = new ArrayList<>(checks);
                times.subList(i, Math.min(times.size(), i + chunk)).forEach(t -> items.add(TransactWriteItem.builder()
                        .put(Put.builder().tableName(table).item(lessonItem(ctx, t)).conditionExpression("attribute_not_exists(SK)").build()).build()));
                try {
                    db(ctx).transactWriteItems(TransactWriteItemsRequest.builder().transactItems(items).build());
                    added += items.size() - checks.size();
                } catch (TransactionCanceledException ex) {
                    if (!ex.hasCancellationReasons() || ex.cancellationReasons().stream().noneMatch(r -> "ConditionalCheckFailed".equals(r.code()))) {
                        throw ex;
                    }
                    stale = true;
                    break;
                }
            }
        }
        return new Rolled(added, stale);
    }

    /** The checks that a date's schedule is still the one read. */
    private List<TransactWriteItem> plannedFrom(AccessContext ctx, LocalDate date, Long defaultVersion, List<ScheduleBlock> override) {
        List<TransactWriteItem> out = new ArrayList<>();
        if (override != null) {
            out.add(TransactWriteItem.builder().conditionCheck(ConditionCheck.builder().tableName(table).key(key(ctx, DATE + date))
                    .conditionExpression("blocks = :b").expressionAttributeValues(Map.of(":b", blocksAttr(override))).build()).build());
            return out;
        }
        out.add(TransactWriteItem.builder().conditionCheck(ConditionCheck.builder().tableName(table).key(key(ctx, DATE + date))
                .conditionExpression("attribute_not_exists(SK)").build()).build());
        ConditionCheck.Builder weekly = ConditionCheck.builder().tableName(table).key(key(ctx, DEFAULT));
        if (defaultVersion == null) {
            weekly.conditionExpression("attribute_not_exists(SK)");
        } else {
            weekly.conditionExpression("scheduleVersion = :v").expressionAttributeValues(Map.of(":v", n(defaultVersion)));
        }
        out.add(TransactWriteItem.builder().conditionCheck(weekly.build()).build());
        return out;
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

    static Map<String, AttributeValue> lessonItem(AccessContext ctx, LessonTime t) {
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

    static LessonTime lessonFrom(Map<String, AttributeValue> m) {
        return new LessonTime(LocalDate.parse(m.get("lessonDate").s()), LocalTime.parse(m.get("startTime").s()),
                Instant.parse(m.get("startsAtUtc").s()), m.get("coachTz").s(), i(m, "durationMinutes"), i(m, "priceMinor"),
                m.get("currency").s(), i(m, "missedLessonFeeMinor"), i(m, "requiredNoticeHours"), i(m, "maxSkaters"),
                i(m, "seatsTaken"), i(m, "blockSeq"), IceType.valueOf(m.get("iceType").s()),
                Long.parseLong(m.get("scheduleVersion").n()), LessonTime.Status.valueOf(m.get("lessonStatus").s()),
                m.containsKey("shareCount") ? i(m, "shareCount") : 0,
                m.containsKey("joinOrder") ? m.get("joinOrder").l().stream().map(AttributeValue::s).toList() : List.of());
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

    // ------------------------------------------------------------------ the schedule-change lease

    /**
     * The coach's schedule-change lease: one run of the schedule change at a time, so one save's lessons all go in one
     * batch and each family gets one email (owner, 2026-11-23; {@code docs/tla/ScheduleApply.tla}).
     */
    static final String LEASE = "SCHEDULE#APPLYING";

    /**
     * A lease older than this was left by a run that stopped: {@code consumer-schedule-change} times out after 5 minutes
     * (infra/lib/consumers.ts), and the holder renews it on each pass.
     */
    public static final java.time.Duration LEASE_ABANDONED = java.time.Duration.ofMinutes(6);

    /**
     * Takes the lease for {@code runId} if it's free, already this run's (a retry of the same event), or abandoned.
     * Otherwise asks the holder to run again, which it does before letting go, and returns {@code false}: the holder's
     * next pass reads the schedule afresh, so this run's change is applied there.
     */
    public boolean takeLease(AccessContext ctx, String runId, Instant now) {
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(key(ctx, LEASE))
                        .conditionExpression("attribute_not_exists(holder) OR holder = :me OR leasedAt <= :stale")
                        .updateExpression("SET holder = :me, leasedAt = :now REMOVE rerun")
                        .expressionAttributeValues(Map.of(":me", s(runId), ":now", s(now.toString()),
                                ":stale", s(now.minus(LEASE_ABANDONED).toString()))).build());
                return true;
            } catch (ConditionalCheckFailedException held) {
                try {
                    db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(key(ctx, LEASE))
                            .conditionExpression("attribute_exists(holder) AND holder <> :me AND leasedAt > :stale")
                            .updateExpression("SET rerun = :t")
                            .expressionAttributeValues(Map.of(":me", s(runId), ":t", AttributeValue.fromBool(true),
                                    ":stale", s(now.minus(LEASE_ABANDONED).toString()))).build());
                    return false;
                } catch (ConditionalCheckFailedException letGo) {
                    // released or abandoned meanwhile: try to take it again
                }
            }
        }
        throw new IllegalStateException("the schedule-change lease kept changing hands");
    }

    /**
     * After a pass: lets the lease go, unless another run asked for a rerun, in which case the request is cleared, the
     * lease renewed, and {@code true} returned so the caller makes another pass.
     */
    public boolean releaseOrRerun(AccessContext ctx, String runId, Instant now) {
        try {
            db(ctx).deleteItem(DeleteItemRequest.builder().tableName(table).key(key(ctx, LEASE))
                    .conditionExpression("holder = :me AND attribute_not_exists(rerun)")
                    .expressionAttributeValues(Map.of(":me", s(runId))).build());
            return false;
        } catch (ConditionalCheckFailedException rerunOrTaken) {
            try {
                db(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(key(ctx, LEASE))
                        .conditionExpression("holder = :me AND attribute_exists(rerun)")
                        .updateExpression("SET leasedAt = :now REMOVE rerun")
                        .expressionAttributeValues(Map.of(":me", s(runId), ":now", s(now.toString()))).build());
                return true;
            } catch (ConditionalCheckFailedException taken) {
                return false; // abandoned and taken by another run, which reads afresh
            }
        }
    }

    /** Lets the lease go after a pass failed; the failed event's retry takes it again and reads afresh. */
    public void releaseLease(AccessContext ctx, String runId) {
        try {
            db(ctx).deleteItem(DeleteItemRequest.builder().tableName(table).key(key(ctx, LEASE))
                    .conditionExpression("holder = :me").expressionAttributeValues(Map.of(":me", s(runId))).build());
        } catch (ConditionalCheckFailedException notOurs) {
            // taken over meanwhile
        }
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
