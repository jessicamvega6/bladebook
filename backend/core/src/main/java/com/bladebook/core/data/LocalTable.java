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

import java.util.List;

/**
 * Makes BladeBook's one table on DynamoDB Local. On AWS the table comes from infrastructure code,
 * which isn't chosen yet. The indexes (GSI1 to GSI4) are added by the batches that first need them:
 * Batch 4 adds GSI1, by client, for a family's own seats (ADR-031 decision 2); Batch 11 adds GSI4, the shared-lesson
 * deadlines the hourly sweep reads.
 */
public final class LocalTable {

    /** GSI1: {@code GSI1PK = CLIENT#<clientId>}, {@code GSI1SK = SEAT#<date>#<startTime>}. */
    static final String GSI1 = "GSI1";

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
                    .attributeDefinitions(attr("PK"), attr("SK"), attr("GSI1PK"), attr("GSI1SK"), attr("GSI4PK"), attr("GSI4SK"))
                    .keySchema(key("PK", KeyType.HASH), key("SK", KeyType.RANGE))
                    .globalSecondaryIndexes(index(GSI1), index(GSI4))
                    .build());
        } catch (ResourceInUseException alreadyThere) {
            addIfMissing(db, table, GSI1);
            addIfMissing(db, table, GSI4);
        }
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
