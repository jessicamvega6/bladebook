package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.DescribeTableRequest;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;

import static org.assertj.core.api.Assertions.assertThat;

class LocalTableTest {

    @Test
    void makesTheTableWithPkAndSkAndCanRunTwice() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        LocalTable.ensure(f.clients.forSetup(), f.table); // second run is a no-op

        var keys = f.clients.forSetup().describeTable(DescribeTableRequest.builder().tableName(f.table).build())
                .table().keySchema();
        assertThat(keys).extracting(KeySchemaElement::attributeName).containsExactly("PK", "SK");
    }

    @Test
    void hasGsi1ByClientForTheFamilysOwnSeats() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        var gsis = f.clients.forSetup().describeTable(DescribeTableRequest.builder().tableName(f.table).build())
                .table().globalSecondaryIndexes();
        var gsi1 = gsis.stream().filter(g -> g.indexName().equals("GSI1")).findFirst().orElseThrow();
        assertThat(gsi1.keySchema()).extracting(KeySchemaElement::attributeName).containsExactly("GSI1PK", "GSI1SK");
    }

    @Test
    void hasGsi4ForTheSweepsDeadlines() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        var gsis = f.clients.forSetup().describeTable(DescribeTableRequest.builder().tableName(f.table).build())
                .table().globalSecondaryIndexes();
        assertThat(gsis).extracting(g -> g.indexName()).containsExactlyInAnyOrder("GSI1", "GSI4");
        var gsi4 = gsis.stream().filter(g -> g.indexName().equals("GSI4")).findFirst().orElseThrow();
        assertThat(gsi4.keySchema()).extracting(KeySchemaElement::attributeName).containsExactly("GSI4PK", "GSI4SK");
    }

    @Test
    void aTableMadeBeforeTheIndexesGetsThemAdded() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        String old = f.table + "-old";
        var db = f.clients.forSetup();
        db.createTable(b -> b.tableName(old).billingMode(software.amazon.awssdk.services.dynamodb.model.BillingMode.PAY_PER_REQUEST)
                .attributeDefinitions(
                        a -> a.attributeName("PK").attributeType(software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType.S),
                        a -> a.attributeName("SK").attributeType(software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType.S))
                .keySchema(k -> k.attributeName("PK").keyType(software.amazon.awssdk.services.dynamodb.model.KeyType.HASH),
                        k -> k.attributeName("SK").keyType(software.amazon.awssdk.services.dynamodb.model.KeyType.RANGE)));

        LocalTable.ensure(db, old);

        var gsis = db.describeTable(DescribeTableRequest.builder().tableName(old).build()).table().globalSecondaryIndexes();
        assertThat(gsis).extracting(g -> g.indexName()).containsExactlyInAnyOrder("GSI1", "GSI4");
    }
}
