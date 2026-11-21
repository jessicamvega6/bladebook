package com.bladebook.core.data;

import com.bladebook.core.domain.FinancialSummary;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A closed year's saved figures and the corrections to closed years, in the coach's partition (Batch 26; ADR-030
 * decision 4 and ADR-MASTER section 12, amended 2026-11-16).
 *
 * <ul>
 *   <li>{@code CLOSEDYEAR#<year>}: the year's twelve months as they stood when it was first saved: {@code months}
 *       (each {@code month}, {@code hasLessons}, {@code paidLessons}, {@code gross}, {@code earlierLessons},
 *       {@code earlierGross}, {@code undoneLessons}, {@code undoneGross}; amounts per currency in minor units),
 *       {@code savedAt}, {@code savedBy}. Written only if not already there, so it never changes once saved.</li>
 *   <li>{@code PAYCORRECTION#<undoneAt>#<seatKey>}: a payment undone after the year it counted in had closed:
 *       {@code undoneAt}, {@code lessonDate}, {@code startTime}, {@code studentId}, {@code amountMinor},
 *       {@code currency}, {@code forYear} (the closed year it counted in), {@code undoneBy}. Written with the undo,
 *       in one transaction ({@link PaymentRepository#undo(AccessContext, String, Undone)}).</li>
 * </ul>
 * Neither holds a name or any personal data.
 */
public final class FinancialRepository {

    /** Who saved a closed year first: the January job, a read of the year, or an undo of one of its payments. */
    public enum SavedBy { JOB, READ, UNDO }

    public record SavedYear(int year, List<FinancialSummary.Month> months, Instant savedAt, SavedBy savedBy) {

        public SavedYear {
            months = List.copyOf(months);
        }
    }

    /** A payment undone after the year it counted in ({@code forYear}) had closed. {@code amountMinor}: what it counted. */
    public record Undone(Instant at, String seatKey, LocalDate lessonDate, LocalTime startTime, String studentId, int amountMinor,
                         String currency, int forYear) {
    }

    static final String CLOSED_YEAR = "CLOSEDYEAR#";
    static final String CORRECTION = "PAYCORRECTION#";

    private final TenantClients clients;
    private final String table;

    public FinancialRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    public Optional<SavedYear> savedYear(AccessContext ctx, int year) {
        Map<String, AttributeValue> m = db(ctx).getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(FamilyItems.key(ctx.partitionKey(), CLOSED_YEAR + year)).build()).item();
        if (m == null || m.isEmpty()) {
            return Optional.empty();
        }
        List<FinancialSummary.Month> months = new ArrayList<>();
        for (AttributeValue v : m.get("months").l()) {
            Map<String, AttributeValue> x = v.m();
            months.add(new FinancialSummary.Month(YearMonth.parse(x.get("month").s()), x.get("hasLessons").bool(),
                    Integer.parseInt(x.get("paidLessons").n()), amounts(x.get("gross")), Map.of(),
                    Integer.parseInt(x.get("earlierLessons").n()), amounts(x.get("earlierGross")),
                    Integer.parseInt(x.get("undoneLessons").n()), amounts(x.get("undoneGross"))));
        }
        return Optional.of(new SavedYear(Integer.parseInt(m.get("year").n()), months, Instant.parse(m.get("savedAt").s()),
                SavedBy.valueOf(m.get("savedBy").s())));
    }

    /** Saves a closed year's figures unless they're already there. False: already saved, and left as they were. */
    public boolean saveYear(AccessContext ctx, SavedYear y) {
        Map<String, AttributeValue> item = new HashMap<>(FamilyItems.key(ctx.partitionKey(), CLOSED_YEAR + y.year()));
        item.put("year", n(y.year()));
        item.put("savedAt", FamilyItems.s(y.savedAt().toString()));
        item.put("savedBy", FamilyItems.s(y.savedBy().name()));
        List<AttributeValue> months = new ArrayList<>();
        for (FinancialSummary.Month mo : y.months()) {
            Map<String, AttributeValue> x = new LinkedHashMap<>();
            x.put("month", FamilyItems.s(mo.month().toString()));
            x.put("hasLessons", AttributeValue.fromBool(mo.hasLessons()));
            x.put("paidLessons", n(mo.paidLessons()));
            x.put("gross", amounts(mo.gross()));
            x.put("earlierLessons", n(mo.earlierLessons()));
            x.put("earlierGross", amounts(mo.earlierGross()));
            x.put("undoneLessons", n(mo.undoneLessons()));
            x.put("undoneGross", amounts(mo.undoneGross()));
            months.add(AttributeValue.fromM(x));
        }
        item.put("months", AttributeValue.fromL(months));
        try {
            db(ctx).putItem(PutItemRequest.builder().tableName(table).item(item).conditionExpression("attribute_not_exists(SK)").build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /**
     * Corrections made from {@code from} to {@code to}, with a day's margin each side (the keys are UTC timestamps,
     * whose text doesn't always sort as time does); {@link FinancialSummary} keeps only the year's own.
     */
    public List<FinancialSummary.Correction> corrections(AccessContext ctx, Instant from, Instant to) {
        List<FinancialSummary.Correction> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND SK BETWEEN :a AND :b")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()),
                            ":a", FamilyItems.s(CORRECTION + from.minus(Duration.ofDays(1))),
                            ":b", FamilyItems.s(CORRECTION + to.plus(Duration.ofDays(1)) + "~")))
                    .exclusiveStartKey(start).build());
            for (Map<String, AttributeValue> m : r.items()) {
                out.add(new FinancialSummary.Correction(Instant.parse(m.get("undoneAt").s()), LocalDate.parse(m.get("lessonDate").s()),
                        Integer.parseInt(m.get("amountMinor").n()), m.get("currency").s()));
            }
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /** The correction item, for the undo's transaction. */
    static Map<String, AttributeValue> correctionItem(AccessContext ctx, Undone u) {
        Map<String, AttributeValue> item = new HashMap<>(FamilyItems.key(ctx.partitionKey(), CORRECTION + u.at() + "#" + u.seatKey()));
        item.put("undoneAt", FamilyItems.s(u.at().toString()));
        item.put("lessonDate", FamilyItems.s(u.lessonDate().toString()));
        item.put("startTime", FamilyItems.s(u.startTime().toString()));
        item.put("studentId", FamilyItems.s(u.studentId()));
        item.put("amountMinor", n(u.amountMinor()));
        item.put("currency", FamilyItems.s(u.currency()));
        item.put("forYear", n(u.forYear()));
        item.put("undoneBy", FamilyItems.s(ctx.coachId()));
        return item;
    }

    private static AttributeValue n(long v) {
        return AttributeValue.fromN(Long.toString(v));
    }

    private static AttributeValue amounts(Map<String, Long> byCurrency) {
        Map<String, AttributeValue> m = new LinkedHashMap<>();
        byCurrency.forEach((c, v) -> m.put(c, n(v)));
        return AttributeValue.fromM(m);
    }

    private static Map<String, Long> amounts(AttributeValue v) {
        Map<String, Long> out = new HashMap<>();
        v.m().forEach((c, x) -> out.put(c, Long.parseLong(x.n())));
        return out;
    }

    private DynamoDbClient db(AccessContext ctx) {
        return clients.clientFor(ctx);
    }
}
