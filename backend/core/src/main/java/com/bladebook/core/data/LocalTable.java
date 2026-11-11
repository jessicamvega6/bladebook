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
 * Batch 4 adds GSI1, by client, for a family's own seats (ADR-031 decision 2).
 */
public final class LocalTable {

    /** GSI1: {@code GSI1PK = CLIENT#<clientId>}, {@code GSI1SK = SEAT#<date>#<startTime>}. */
    static final String GSI1 = "GSI1";

    private LocalTable() {
    }

    /** Creates the table if it's missing, and adds any index it's missing. Safe to run every start. */
    public static void ensure(DynamoDbClient db, String table) {
        try {
            db.createTable(CreateTableRequest.builder()
                    .tableName(table)
                    .billingMode(BillingMode.PAY_PER_REQUEST)
                    .attributeDefinitions(attr("PK"), attr("SK"), attr("GSI1PK"), attr("GSI1SK"))
                    .keySchema(key("PK", KeyType.HASH), key("SK", KeyType.RANGE))
                    .globalSecondaryIndexes(GlobalSecondaryIndex.builder().indexName(GSI1)
                            .keySchema(key("GSI1PK", KeyType.HASH), key("GSI1SK", KeyType.RANGE))
                            .projection(Projection.builder().projectionType(ProjectionType.ALL).build()).build())
                    .build());
        } catch (ResourceInUseException alreadyThere) {
            addGsi1IfMissing(db, table);
        }
    }

    /** A table made by an earlier batch's build, kept in the Docker volume, has no GSI1 yet. */
    private static void addGsi1IfMissing(DynamoDbClient db, String table) {
        List<GlobalSecondaryIndexDescription> gsis = db.describeTable(DescribeTableRequest.builder().tableName(table).build())
                .table().globalSecondaryIndexes();
        if (gsis.stream().anyMatch(g -> GSI1.equals(g.indexName()))) {
            return;
        }
        db.updateTable(UpdateTableRequest.builder().tableName(table)
                .attributeDefinitions(attr("GSI1PK"), attr("GSI1SK"))
                .globalSecondaryIndexUpdates(GlobalSecondaryIndexUpdate.builder().create(CreateGlobalSecondaryIndexAction.builder()
                        .indexName(GSI1).keySchema(key("GSI1PK", KeyType.HASH), key("GSI1SK", KeyType.RANGE))
                        .projection(Projection.builder().projectionType(ProjectionType.ALL).build()).build()).build())
                .build());
    }

    private static AttributeDefinition attr(String name) {
        return AttributeDefinition.builder().attributeName(name).attributeType(ScalarAttributeType.S).build();
    }

    private static KeySchemaElement key(String name, KeyType type) {
        return KeySchemaElement.builder().attributeName(name).keyType(type).build();
    }
}
