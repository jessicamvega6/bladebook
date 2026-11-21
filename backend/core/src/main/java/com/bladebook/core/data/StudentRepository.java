package com.bladebook.core.data;

import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ReturnValue;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The coach's {@code STUDENT#} records (ADR-MASTER section 5, "Approval"). {@code api-coach} writes only
 * these; the family's link item follows through {@code consumer-student-link}.
 */
public final class StudentRepository {

    private static final String GONE = "That skater isn’t waiting for approval any more. Reload the page.";

    private final TenantClients clients;
    private final String table;

    public StudentRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /** Every skater with this coach, waiting or approved. */
    public List<StudentRecord> list(AccessContext ctx) {
        List<StudentRecord> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = clients.clientFor(ctx).query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :sk)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(ctx.partitionKey()), ":sk", FamilyItems.s(FamilyItems.STUDENT)))
                    .exclusiveStartKey(start).build());
            r.items().forEach(m -> out.add(FamilyItems.student(m)));
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /**
     * {@code PENDING} to {@code ACTIVE}. Approving an approved skater again changes nothing.
     *
     * @throws DomainException CONFLICT when the coach has no such skater (declined, or never theirs)
     */
    public StudentRecord approve(AccessContext ctx, String studentId) {
        Map<String, AttributeValue> key = FamilyItems.studentKey(ctx.coachId(), FamilyItems.safeStudentId(studentId));
        try {
            Map<String, AttributeValue> after = clients.clientFor(ctx).updateItem(UpdateItemRequest.builder().tableName(table)
                    .key(key)
                    .conditionExpression("attribute_exists(PK)")
                    .updateExpression("SET studentStatus = :a")
                    .expressionAttributeValues(Map.of(":a", FamilyItems.s(StudentStatus.ACTIVE.name())))
                    .returnValues(ReturnValue.ALL_NEW).build()).attributes();
            return FamilyItems.student(after);
        } catch (ConditionalCheckFailedException e) {
            throw DomainException.conflict(GONE);
        }
    }

    /**
     * Declining deletes the record outright; nothing is archived (ADR-MASTER section 5). Only a skater
     * still waiting can be declined.
     *
     * @return what the record held, for the family's email and the link's removal
     * @throws DomainException CONFLICT when the skater is already approved or isn't there
     */
    public StudentRecord decline(AccessContext ctx, String studentId) {
        Map<String, AttributeValue> key = FamilyItems.studentKey(ctx.coachId(), FamilyItems.safeStudentId(studentId));
        try {
            Map<String, AttributeValue> before = clients.clientFor(ctx).deleteItem(DeleteItemRequest.builder().tableName(table)
                    .key(key)
                    .conditionExpression("studentStatus = :p")
                    .expressionAttributeValues(Map.of(":p", FamilyItems.s(StudentStatus.PENDING.name())))
                    .returnValues(ReturnValue.ALL_OLD).build()).attributes();
            return FamilyItems.student(before);
        } catch (ConditionalCheckFailedException e) {
            Map<String, AttributeValue> now = clients.clientFor(ctx).getItem(GetItemRequest.builder().tableName(table)
                    .consistentRead(true).key(key).build()).item();
            throw DomainException.conflict(now == null || now.isEmpty() ? GONE
                    : FamilyItems.str(now, "studentName") + " is already approved, so they can’t be declined.");
        }
    }
}
