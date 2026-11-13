package com.bladebook.core.data;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition;
import software.amazon.awssdk.services.dynamodb.model.BillingMode;
import software.amazon.awssdk.services.dynamodb.model.CreateGlobalSecondaryIndexAction;
import software.amazon.awssdk.services.dynamodb.model.CreateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.DescribeTableRequest;
import software.amazon.awssdk.services.dynamodb.model.GlobalSecondaryIndex;
import software.amazon.awssdk.services.dynamodb.model.GlobalSecondaryIndexDescription;
import software.amazon.awssdk.services.dynamodb.model.GlobalSecondaryIndexUpdate;
import software.amazon.awssdk.services.dynamodb.model.IndexStatus;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;
import software.amazon.awssdk.services.dynamodb.model.KeyType;
import software.amazon.awssdk.services.dynamodb.model.Projection;
import software.amazon.awssdk.services.dynamodb.model.ProjectionType;
import software.amazon.awssdk.services.dynamodb.model.ResourceInUseException;
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType;
import software.amazon.awssdk.services.dynamodb.model.UpdateTableRequest;

import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Makes BladeBook's one table on DynamoDB Local. On AWS the table comes from infrastructure code,
 * which isn't chosen yet. The indexes (GSI1 to GSI4) are added by the batches that first need them:
 * Batch 4 adds GSI1, by client, for a family's own seats (ADR-031 decision 2); Batch 11 adds GSI4, the shared-lesson
 * deadlines the hourly sweep reads; Batch 13 adds GSI2 (seats by date, for the 7am job) and GSI3 (unpaid seats, for the
 * weekly reminder), and {@link #backfillSeatIndexes} gives seats written before then their keys.
 */
public final class LocalTable {

    /** GSI1: {@code GSI1PK = CLIENT#<clientId>}, {@code GSI1SK = SEAT#<date>#<startTime>}. */
    static final String GSI1 = "GSI1";

    /** GSI2: {@code GSI2PK = DATE#<date>}, {@code GSI2SK = COACH#<coachId>#<startTime>}. */
    static final String GSI2 = "GSI2";

    /** GSI3 (sparse): {@code GSI3PK = COACH#<coachId>}, {@code GSI3SK = UNPAID#<date>#<studentId>}. */
    static final String GSI3 = "GSI3";

    /** GSI4 (sparse): {@code GSI4PK = DUE}, {@code GSI4SK = <dueAtUtc>#<coachId>#<itemKey>}. */
    static final String GSI4 = "GSI4";

    private LocalTable() {
    }

    /** Creates the table if it's missing, and adds any index it's missing. Safe to run every start. */
    public static void ensure(DynamoDbClient db, String table) {
        try {
            db.createTable(CreateTableRequest.builder()
                    .tableName(table)
                    .billingMode(BillingMode.PAY_PER_REQUEST)
                    .attributeDefinitions(attr("PK"), attr("SK"), attr("GSI1PK"), attr("GSI1SK"), attr("GSI2PK"), attr("GSI2SK"),
                            attr("GSI3PK"), attr("GSI3SK"), attr("GSI4PK"), attr("GSI4SK"))
                    .keySchema(key("PK", KeyType.HASH), key("SK", KeyType.RANGE))
                    .globalSecondaryIndexes(index(GSI1), index(GSI2), index(GSI3), index(GSI4))
                    .build());
        } catch (ResourceInUseException alreadyThere) {
            addIfMissing(db, table, GSI1);
            addIfMissing(db, table, GSI2);
            addIfMissing(db, table, GSI3);
            addIfMissing(db, table, GSI4);
        }
    }

    /**
     * Seats written before Batch 13 have no GSI2 or GSI3 keys, so the 7am job and the unpaid reminder wouldn't see them:
     * each seat that will happen ({@code BOOKED}, {@code CHECKED_IN}, {@code NO_SHOW}) gets GSI2, and each still unpaid gets
     * GSI3. A seat with no GSI2 was booked before emails existed, so it's also marked {@code confirmationSent} (and
     * {@code paymentReminderSent} once checked in): its next write mustn't send a "Booked" email weeks late. Local tables
     * only; safe to run every start. Returns how many seats it changed.
     */
    public static int backfillSeatIndexes(DynamoDbClient db, String table) {
        int changed = 0;
        Map<String, AttributeValue> start = null;
        do {
            ScanResponse r = db.scan(ScanRequest.builder().tableName(table)
                    .filterExpression("begins_with(SK, :seat) AND seatStatus <> :invited AND (attribute_not_exists(GSI2PK)"
                            + " OR ((attribute_not_exists(paymentStatus) OR paymentStatus = :unpaid) AND attribute_not_exists(GSI3PK)))")
                    .expressionAttributeValues(Map.of(":seat", AttributeValue.fromS(SeatItems.SEAT), ":invited", AttributeValue.fromS("INVITED"),
                            ":unpaid", AttributeValue.fromS("UNPAID")))
                    .exclusiveStartKey(start).build());
            for (Map<String, AttributeValue> m : r.items()) {
                String coachId = m.get("PK").s().substring("COACH#".length());
                LocalDate date = LocalDate.parse(m.get("lessonDate").s());
                Map<String, AttributeValue> v = new HashMap<>();
                SeatItems.dateIndex(coachId, date, LocalTime.parse(m.get("startTime").s())).forEach((k, x) -> v.put(":" + k, x));
                String set = "SET GSI2PK = :GSI2PK, GSI2SK = :GSI2SK";
                if (!m.containsKey("GSI2PK")) {
                    v.put(":old", AttributeValue.fromS("before-batch-13"));
                    set += ", confirmationSent = if_not_exists(confirmationSent, :old)";
                    if ("CHECKED_IN".equals(m.get("seatStatus").s())) {
                        set += ", paymentReminderSent = if_not_exists(paymentReminderSent, :old)";
                    }
                }
                String status = m.containsKey("paymentStatus") ? m.get("paymentStatus").s() : "UNPAID";
                if ("UNPAID".equals(status)) {
                    SeatItems.unpaidIndex(coachId, date, m.get("studentId").s()).forEach((k, x) -> v.put(":" + k, x));
                    set += ", GSI3PK = :GSI3PK, GSI3SK = :GSI3SK";
                }
                db.updateItem(UpdateItemRequest.builder().tableName(table).key(Map.of("PK", m.get("PK"), "SK", m.get("SK")))
                        .updateExpression(set).expressionAttributeValues(v).build());
                changed++;
            }
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return changed;
    }

    private static GlobalSecondaryIndex index(String name) {
        return GlobalSecondaryIndex.builder().indexName(name)
                .keySchema(key(name + "PK", KeyType.HASH), key(name + "SK", KeyType.RANGE))
                .projection(Projection.builder().projectionType(ProjectionType.ALL).build()).build();
    }

    /** A table made by an earlier batch's build, kept in the Docker volume, may lack an index added since. */
    private static void addIfMissing(DynamoDbClient db, String table, String name) {
        List<GlobalSecondaryIndexDescription> gsis = db.describeTable(DescribeTableRequest.builder().tableName(table).build())
                .table().globalSecondaryIndexes();
        if (gsis != null && gsis.stream().anyMatch(g -> name.equals(g.indexName()))) {
            return;
        }
        waitForIndexes(db, table);
        db.updateTable(UpdateTableRequest.builder().tableName(table)
                .attributeDefinitions(attr(name + "PK"), attr(name + "SK"))
                .globalSecondaryIndexUpdates(GlobalSecondaryIndexUpdate.builder().create(CreateGlobalSecondaryIndexAction.builder()
                        .indexName(name).keySchema(key(name + "PK", KeyType.HASH), key(name + "SK", KeyType.RANGE))
                        .projection(Projection.builder().projectionType(ProjectionType.ALL).build()).build()).build())
                .build());
    }

    /** DynamoDB builds one new index at a time; wait until none is still being made. */
    private static void waitForIndexes(DynamoDbClient db, String table) {
        for (int i = 0; i < 600; i++) {
            List<GlobalSecondaryIndexDescription> gsis = db.describeTable(DescribeTableRequest.builder().tableName(table).build())
                    .table().globalSecondaryIndexes();
            if (gsis == null || gsis.stream().allMatch(g -> g.indexStatus() == IndexStatus.ACTIVE)) {
                return;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static AttributeDefinition attr(String name) {
        return AttributeDefinition.builder().attributeName(name).attributeType(ScalarAttributeType.S).build();
    }

    private static KeySchemaElement key(String name, KeyType type) {
        return KeySchemaElement.builder().attributeName(name).keyType(type).build();
    }
}
