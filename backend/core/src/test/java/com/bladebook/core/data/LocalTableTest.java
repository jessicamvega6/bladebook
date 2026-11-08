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
}
