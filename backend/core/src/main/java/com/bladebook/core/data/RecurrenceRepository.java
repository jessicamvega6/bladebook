package com.bladebook.core.data;

import com.bladebook.core.domain.Recurrence;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A family's repeating-booking headers, in its own partition (ADR-MASTER section 7). The application never deletes one.
 */
public final class RecurrenceRepository {

    private final TenantClients clients;
    private final String table;

    public RecurrenceRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /** Writes the header only if there isn't one: after booking, and for the header repair. False if it was there. */
    public boolean putIfMissing(ClientContext ctx, Recurrence r) {
        try {
            clients.clientFor(ctx).putItem(b -> b.tableName(table).item(item(ctx, r)).conditionExpression("attribute_not_exists(SK)"));
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /**
     * Claims the header for one change (end earlier, less often, stop) before anything is cancelled: only if it's still as
     * read and no other change is in progress, or the one in progress started before {@code abandonedBefore} (its request
     * died). Sets {@code changingId} and {@code changingSince}. False if another window got there first.
     */
    public boolean claim(ClientContext ctx, Recurrence asRead, String changeId, Instant now, Instant abandonedBefore) {
        try {
            clients.clientFor(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), asRead.key()))
                    .conditionExpression("recurrenceStatus = :st AND endDate = :end AND intervalWeeks = :iw"
                            + " AND (attribute_not_exists(changingId) OR changingSince < :stale)")
                    .updateExpression("SET changingId = :id, changingSince = :now")
                    .expressionAttributeValues(Map.of(":st", FamilyItems.s(asRead.status().name()),
                            ":end", FamilyItems.s(asRead.endDate().toString()),
                            ":iw", AttributeValue.fromN(Integer.toString(asRead.intervalWeeks())),
                            ":stale", FamilyItems.s(abandonedBefore.toString()), ":id", FamilyItems.s(changeId),
                            ":now", FamilyItems.s(now.toString()))).build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /** The change's result (the new end date, interval or status), with the claim removed: only while it's still this change's. */
    public boolean save(ClientContext ctx, Recurrence r, String changeId) {
        try {
            clients.clientFor(ctx).putItem(b -> b.tableName(table).item(item(ctx, r)).conditionExpression("changingId = :id")
                    .expressionAttributeValues(Map.of(":id", FamilyItems.s(changeId))));
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /** A change that couldn't finish lets go of the header, as it was. */
    public void release(ClientContext ctx, Recurrence r, String changeId) {
        try {
            clients.clientFor(ctx).updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(ctx.partitionKey(), r.key()))
                    .conditionExpression("changingId = :id").updateExpression("REMOVE changingId, changingSince")
                    .expressionAttributeValues(Map.of(":id", FamilyItems.s(changeId))).build());
        } catch (ConditionalCheckFailedException gone) {
            // no longer ours
        }
    }

    public List<Recurrence> list(ClientContext ctx) {
        List<Recurrence> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = clients.clientFor(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :p)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()), ":p", FamilyItems.s("RECURRENCE#")))
                    .exclusiveStartKey(start).build());
            r.items().forEach(m -> out.add(from(m)));
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    private static Map<String, AttributeValue> item(ClientContext ctx, Recurrence r) {
        Map<String, AttributeValue> m = new HashMap<>(FamilyItems.key(ctx.partitionKey(), r.key()));
        m.put("coachId", FamilyItems.s(r.coachId()));
        m.put("recurrenceId", FamilyItems.s(r.recurrenceId()));
        m.put("studentId", FamilyItems.s(r.studentId()));
        m.put("clientId", FamilyItems.s(r.clientId()));
        m.put("weekday", FamilyItems.s(r.weekday().name()));
        m.put("startTime", FamilyItems.s(r.startTime().toString()));
        m.put("intervalWeeks", AttributeValue.fromN(Integer.toString(r.intervalWeeks())));
        m.put("endDate", FamilyItems.s(r.endDate().toString()));
        m.put("startedOn", FamilyItems.s(r.startedOn().toString()));
        m.put("recurrenceStatus", FamilyItems.s(r.status().name()));
        return m;
    }

    private static Recurrence from(Map<String, AttributeValue> m) {
        return new Recurrence(FamilyItems.str(m, "coachId"), FamilyItems.str(m, "recurrenceId"), FamilyItems.str(m, "studentId"),
                FamilyItems.str(m, "clientId"), DayOfWeek.valueOf(FamilyItems.str(m, "weekday")), LocalTime.parse(FamilyItems.str(m, "startTime")),
                Integer.parseInt(m.get("intervalWeeks").n()), LocalDate.parse(FamilyItems.str(m, "endDate")),
                LocalDate.parse(FamilyItems.str(m, "startedOn")), Recurrence.Status.valueOf(FamilyItems.str(m, "recurrenceStatus")));
    }
}
