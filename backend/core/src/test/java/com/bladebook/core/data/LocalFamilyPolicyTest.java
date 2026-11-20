package com.bladebook.core.data;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemResponse;
import software.amazon.awssdk.services.dynamodb.model.DynamoDbException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.KeysAndAttributes;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ReturnValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Local mode plays {@code client-tenant}'s and {@code code-lookup}'s policies (ADR-022, I2, I30): each rule, allowed and
 * refused. The delegate answers everything with nothing, so only the policy is under test.
 */
class LocalFamilyPolicyTest {

    private static final String FAMILY = "f1";
    private static final String COACH = "c1";

    private final DynamoDbClient nothing = new DynamoDbClient() {
        @Override public GetItemResponse getItem(GetItemRequest r) { return GetItemResponse.builder().build(); }
        @Override public QueryResponse query(QueryRequest r) { return QueryResponse.builder().build(); }
        @Override public BatchGetItemResponse batchGetItem(BatchGetItemRequest r) { return BatchGetItemResponse.builder().build(); }
        @Override public PutItemResponse putItem(PutItemRequest r) { return PutItemResponse.builder().build(); }
        @Override public DeleteItemResponse deleteItem(DeleteItemRequest r) { return DeleteItemResponse.builder().build(); }
        @Override public TransactWriteItemsResponse transactWriteItems(TransactWriteItemsRequest r) { return TransactWriteItemsResponse.builder().build(); }
        @Override public String serviceName() { return "dynamodb"; }
        @Override public void close() { }
    };

    private final DynamoDbClient first = LocalFamilyPolicy.family(nothing, FAMILY);
    private final DynamoDbClient active = LocalFamilyPolicy.familyWithCoach(nothing, FAMILY, COACH, true);
    private final DynamoDbClient waiting = LocalFamilyPolicy.familyWithCoach(nothing, FAMILY, COACH, false);
    private final DynamoDbClient lookup = LocalFamilyPolicy.codeLookup(nothing);

    private static Map<String, AttributeValue> key(String pk, String sk) {
        return Map.of("PK", AttributeValue.fromS(pk), "SK", AttributeValue.fromS(sk));
    }

    private static GetItemRequest get(String pk, String projection) {
        GetItemRequest.Builder b = GetItemRequest.builder().tableName("t").key(key(pk, "X"));
        return projection == null ? b.build() : b.projectionExpression(projection).build();
    }

    private static QueryRequest query(String index, String keyName, String value, String projection) {
        QueryRequest.Builder b = QueryRequest.builder().tableName("t").indexName(index)
                .keyConditionExpression("#k = :v").expressionAttributeNames(Map.of("#k", keyName))
                .expressionAttributeValues(Map.of(":v", AttributeValue.fromS(value)));
        return projection == null ? b.build() : b.projectionExpression(projection).build();
    }

    private static void refused(Runnable r) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(DynamoDbException.class,
                e -> assertThat(e.awsErrorDetails().errorCode()).isEqualTo("AccessDeniedException"));
    }

    @Test
    void theFamilysOwnPartitionAndIndexAreOpenInBothSessions() {
        for (DynamoDbClient db : List.of(first, active, waiting)) {
            assertThatCode(() -> db.getItem(get("CLIENT#" + FAMILY, null))).doesNotThrowAnyException();
            assertThatCode(() -> db.query(query(null, "PK", "CLIENT#" + FAMILY, null))).doesNotThrowAnyException();
            assertThatCode(() -> db.query(query("GSI1", "GSI1PK", "CLIENT#" + FAMILY, null))).doesNotThrowAnyException();
            assertThatCode(() -> db.putItem(PutItemRequest.builder().tableName("t").item(key("CLIENT#" + FAMILY, "X")).build()))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void anotherFamilysPartitionOrIndexEntriesAndOtherIndexesAreRefused() {
        refused(() -> active.getItem(get("CLIENT#other", null)));
        refused(() -> active.query(query("GSI1", "GSI1PK", "CLIENT#other", null)));
        refused(() -> active.query(query("GSI2", "GSI2PK", "DATE#2026-11-20", null)));
        refused(() -> active.scan(ScanRequest.builder().tableName("t").build()));
    }

    @Test
    void theCoachsPartitionIsReadOnlyThroughTheAllowlistWhileActive() {
        assertThatCode(() -> active.getItem(get("COACH#" + COACH, "PK, SK, priceMinor, #s")
                .toBuilder().expressionAttributeNames(Map.of("#s", "seatsTaken")).build())).doesNotThrowAnyException();
        assertThatCode(() -> active.query(query(null, "PK", "COACH#" + COACH, "PK, SK, lessonDate, startTime")))
                .doesNotThrowAnyException();
        // A seat's personal fields, a whole item, a waiting family, the first session, another coach: all refused.
        refused(() -> active.getItem(get("COACH#" + COACH, "PK, SK, studentName")));
        refused(() -> active.getItem(get("COACH#" + COACH, null)));
        refused(() -> active.query(query(null, "PK", "COACH#" + COACH, null)));
        refused(() -> waiting.getItem(get("COACH#" + COACH, "PK, SK, priceMinor")));
        refused(() -> first.getItem(get("COACH#" + COACH, "PK, SK, priceMinor")));
        refused(() -> active.getItem(get("COACH#other", "PK, SK, priceMinor")));
        refused(() -> active.batchGetItem(BatchGetItemRequest.builder().requestItems(Map.of("t",
                KeysAndAttributes.builder().keys(key("COACH#" + COACH, "A"), key("COACH#other", "B"))
                        .projectionExpression("PK, SK, priceMinor").build())).build()));
    }

    @Test
    void writesLandOnlyInTheTaggedCoachReturningNothingWaitingOrNot() {
        for (DynamoDbClient db : List.of(active, waiting)) {
            assertThatCode(() -> db.putItem(PutItemRequest.builder().tableName("t").item(key("COACH#" + COACH, "X")).build()))
                    .doesNotThrowAnyException();
        }
        refused(() -> first.putItem(PutItemRequest.builder().tableName("t").item(key("COACH#" + COACH, "X")).build()));
        refused(() -> active.putItem(PutItemRequest.builder().tableName("t").item(key("COACH#other", "X")).build()));
        refused(() -> active.deleteItem(DeleteItemRequest.builder().tableName("t").key(key("COACH#" + COACH, "X"))
                .returnValues(ReturnValue.ALL_OLD).build()));
        refused(() -> active.transactWriteItems(TransactWriteItemsRequest.builder().transactItems(
                TransactWriteItem.builder().put(Put.builder().tableName("t").item(key("CLIENT#" + FAMILY, "X")).build()).build(),
                TransactWriteItem.builder().put(Put.builder().tableName("t").item(key("COACH#other", "X")).build()).build()).build()));
    }

    @Test
    void codesAreReadOneItemAtATimeAndOnlyTheirNamedFields() {
        assertThatCode(() -> lookup.getItem(get("CODE#7K2QM9XT", "coachFirstName, coachLastName"))).doesNotThrowAnyException();
        assertThatCode(() -> first.getItem(get("CODE#7K2QM9XT", "coachId, coachFirstName"))).doesNotThrowAnyException();
        assertThatCode(() -> first.getItem(get("SKATERCODE#ABC", "studentId, studentName"))).doesNotThrowAnyException();
        refused(() -> lookup.getItem(get("CODE#7K2QM9XT", null)));
        refused(() -> lookup.getItem(get("SKATERCODE#ABC", "studentId")));
        refused(() -> lookup.getItem(get("CLIENT#" + FAMILY, null)));
        refused(() -> first.getItem(get("SKATERCODE#ABC", "studentId, clientId")));
        refused(() -> first.query(query(null, "PK", "CODE#7K2QM9XT", "coachId")));
    }

    @Test
    void theAllowlistIsTheFileTheRoleIsBuiltFromAndNamesNoPersonalField() {
        LocalFamilyPolicy.Allowlist a = LocalFamilyPolicy.Allowlist.LOADED;
        assertThat(a.coachPublic()).contains("PK", "SK", "priceMinor", "idempotencyKey", "studentStatus")
                .doesNotContain("studentName", "clientId", "clientName", "clientEmail", "clientPhone", "partnerName", "invitedByName");
        assertThat(a.coachCode()).containsExactlyInAnyOrder("PK", "SK", "coachId", "coachFirstName", "coachLastName", "profilePhotoKey");
        assertThat(a.skaterCode()).containsExactlyInAnyOrder("PK", "SK", "studentId", "studentName");
    }
}
