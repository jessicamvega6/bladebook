package com.bladebook.core.data;

import com.bladebook.core.domain.DisplayName;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.ShareCode;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.StudentStatus;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.random.RandomGenerator;

/**
 * The writes of the two consumers that keep copies in step (ADR-MASTER sections 3 and 5):
 * <ul>
 *   <li>{@code consumer-student-link}: a coach's {@code STUDENT#} change reaches the family's link item;</li>
 *   <li>{@code consumer-family-sync}: a family's contact change reaches every coach's {@code STUDENT#}
 *       record of its skaters, and only records whose {@code clientId} is that family's.</li>
 * </ul>
 * On AWS these run as the consumers' own roles, from events. Locally they're called in-process after the
 * write (a listed shortcut).
 */
public final class SyncRepository {

    private final TenantClients clients;
    private final String table;

    public SyncRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /** Sets the link's status. A link that's gone (the skater was declined meanwhile) stays gone. */
    public void setLinkStatus(String clientId, String coachId, String studentId, StudentStatus status) {
        try {
            clients.forConsumer().updateItem(UpdateItemRequest.builder().tableName(table)
                    .key(FamilyItems.linkKey(clientId, coachId, studentId))
                    .conditionExpression("attribute_exists(PK)")
                    .updateExpression("SET studentStatus = :s")
                    .expressionAttributeValues(Map.of(":s", FamilyItems.s(status.name()))).build());
        } catch (ConditionalCheckFailedException gone) {
            // nothing to update
        }
    }

    public void deleteLink(String clientId, String coachId, String studentId) {
        clients.forConsumer().deleteItem(DeleteItemRequest.builder().tableName(table)
                .key(FamilyItems.linkKey(clientId, coachId, studentId)).build());
    }

    /** The family's partition, read by the consumer from the event's {@code clientId}. */
    public Optional<FamilyAccount> account(String clientId) {
        return FamilyItems.account(FamilyRepository.queryPartition(clients.forConsumer(), table, "CLIENT#" + clientId));
    }

    /**
     * Copies the profile's contact details onto each coach's record of each linked skater.
     *
     * @return how many records were updated
     */
    public int copyContact(FamilyAccount account) {
        FamilyProfile p = account.profile();
        int n = 0;
        for (SkaterLink l : account.links()) {
            try {
                clients.forConsumer().updateItem(UpdateItemRequest.builder().tableName(table)
                        .key(FamilyItems.studentKey(l.coachId(), l.studentId()))
                        .conditionExpression("clientId = :c")
                        .updateExpression("SET clientName = :n, clientPhone = :p, clientEmail = :e")
                        .expressionAttributeValues(Map.of(":c", FamilyItems.s(p.clientId()), ":n", FamilyItems.s(p.fullName()),
                                ":p", FamilyItems.s(p.phone()), ":e", FamilyItems.s(p.email()))).build());
                n++;
            } catch (ConditionalCheckFailedException notTheirs) {
                // declined meanwhile, or never this family's record
            }
        }
        return n;
    }

    private static final RandomGenerator RANDOM = new SecureRandom();

    /** @see com.bladebook.core.service.FamilySyncService#issueShareCodes */
    public int issueShareCodes(FamilyAccount account) {
        int n = 0;
        for (Skater k : account.skaters()) {
            if (k.shareCode() == null && issue(account.profile().clientId(), k)) {
                n++;
            }
        }
        return n;
    }

    private boolean issue(String clientId, Skater k) {
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = ShareCode.generate(k.name(), RANDOM);
            Map<String, AttributeValue> item = new HashMap<>(FamilyItems.key(ShareRepository.SKATERCODE + code, "CODE"));
            item.put("studentId", FamilyItems.s(k.studentId()));
            item.put("studentName", FamilyItems.s(DisplayName.of(k.name())));
            try {
                clients.forConsumer().putItem(PutItemRequest.builder().tableName(table).item(item)
                        .conditionExpression("attribute_not_exists(PK)").build());
            } catch (ConditionalCheckFailedException taken) {
                continue;
            }
            try {
                clients.forConsumer().updateItem(UpdateItemRequest.builder().tableName(table)
                        .key(FamilyItems.key("CLIENT#" + clientId, FamilyItems.SKATER + k.studentId()))
                        .conditionExpression("attribute_exists(PK) AND attribute_not_exists(shareCode)")
                        .updateExpression("SET shareCode = :c")
                        .expressionAttributeValues(Map.of(":c", FamilyItems.s(code))).build());
                return true;
            } catch (ConditionalCheckFailedException alreadyHasOne) {
                // Issued meanwhile by another run: this code is never handed out.
                clients.forConsumer().deleteItem(DeleteItemRequest.builder().tableName(table)
                        .key(FamilyItems.key(ShareRepository.SKATERCODE + code, "CODE")).build());
                return false;
            }
        }
        throw new IllegalStateException("No free share code after 20 tries");
    }
}
