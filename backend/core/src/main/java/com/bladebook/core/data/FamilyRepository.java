package com.bladebook.core.data;

import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.CoachPublicProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.FamilyStanding;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.PaymentTypes.Type;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;
import software.amazon.awssdk.services.dynamodb.model.Update;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * A family's own partition, {@code CLIENT#<sub>}, and the {@code PENDING} records registration writes
 * into each coach's partition (ADR-MASTER sections 5 and 16).
 *
 * <p>Every method takes the caller's {@link ClientContext}. Reading a coach's partition takes a
 * {@link LinkedCoach} and is refused unless the family is {@code ACTIVE} with that coach: the
 * allowlist fails closed. Nothing here asks for return values or uses
 * {@code ReturnValuesOnConditionCheckFailure}.
 */
public final class FamilyRepository {

    private static final String ALREADY = "You’re already signed up. Log in to see your account.";

    private final TenantClients clients;
    private final String table;

    public FamilyRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // ------------------------------------------------------------------ writes

    /**
     * Registration: the profile, the {@code SKATER#} items, and per skater per coach a link and a {@code PENDING}
     * {@code STUDENT#} record (ADR-MASTER section 5, step 6). One transaction per coach, each through that coach's own
     * session, the profile and skaters with the first (owner, 2026-11-20, I30).
     *
     * @param coaches each coach the records name, resolved from its code: its session's tag and its name for the links
     * @throws DomainException CONFLICT if the family already has a profile, or if a later coach's write failed: the
     *                         family is then registered with the earlier coaches and told to add the missed ones
     */
    public void register(ClientContext ctx, FamilyProfile profile, List<Skater> skaters, List<StudentRecord> students,
                         List<CodeRepository.Found> coaches) {
        if (!profile.clientId().equals(ctx.clientId())) {
            throw new IllegalArgumentException("profile does not belong to the caller");
        }
        List<TransactWriteItem> own = new ArrayList<>();
        own.add(put(FamilyItems.profileItem(profile)));
        for (Skater k : skaters) {
            own.add(put(FamilyItems.skaterItem(ctx.clientId(), profile.relationship(), k)));
        }
        perCoach(ctx, own, students, coaches, ALREADY, "You’re signed up");
    }

    /**
     * Profile → Add a skater (A9; ADR-025 item k): the {@code SKATER#} item, and a link and a {@code PENDING} record per coach
     * picked, one transaction per coach (I30). With no coach, only the skater: no coach is asked about someone they won't
     * teach.
     *
     * @param coaches the family's own approved coaches picked, from its links
     */
    public void addSkater(ClientContext ctx, ClientRelationship rel, Skater k, List<StudentRecord> students,
                          List<CodeRepository.Found> coaches) {
        perCoach(ctx, List.of(put(FamilyItems.skaterItem(ctx.clientId(), rel, k))), students, coaches,
                "That skater was just added. Reload the page.", k.name() + " is added");
    }

    /** Add a coach: a link and a {@code PENDING} record per chosen skater, for one coach (ADR-025 item k). */
    public void addCoach(ClientContext ctx, List<StudentRecord> students, CodeRepository.Found coach) {
        perCoach(ctx, List.of(), students, List.of(coach), "One of those skaters was just sent to that coach. Reload the page.", "");
    }

    /**
     * {@code own} (the family's own items) with the first coach's records, then each further coach's, each through that
     * coach's session (ADR-022 d8, I30). A conflict on the first is {@code conflict}; a failure on a later one leaves the
     * earlier writes standing and names the coaches it missed.
     */
    private void perCoach(ClientContext ctx, List<TransactWriteItem> own, List<StudentRecord> students,
                          List<CodeRepository.Found> coaches, String conflict, String done) {
        Map<String, CodeRepository.Found> byId = new LinkedHashMap<>();
        coaches.forEach(c -> byId.put(c.coachId(), c));
        Map<String, List<TransactWriteItem>> writes = new LinkedHashMap<>();
        for (StudentRecord r : students) {
            if (!r.clientId().equals(ctx.clientId()) || r.status() != StudentStatus.PENDING) {
                throw new IllegalArgumentException("a family writes only its own PENDING records");
            }
            CodeRepository.Found coach = byId.get(r.coachId());
            if (coach == null) {
                throw new IllegalArgumentException("a record names a coach that wasn't resolved");
            }
            List<TransactWriteItem> w = writes.computeIfAbsent(r.coachId(), id -> new ArrayList<>());
            w.add(put(FamilyItems.linkItem(r, coach.name())));
            w.add(put(FamilyItems.studentItem(r)));
        }
        if (writes.isEmpty()) {
            write(clients.clientFor(ctx), own, conflict);
            return;
        }
        List<String> missed = new ArrayList<>();
        boolean first = true;
        for (Map.Entry<String, List<TransactWriteItem>> e : writes.entrySet()) {
            CodeRepository.Found coach = byId.get(e.getKey());
            List<TransactWriteItem> items = new ArrayList<>(first ? own : List.of());
            items.addAll(e.getValue());
            DynamoDbClient db = clients.clientFor(ctx, coach.coach());
            if (first) {
                write(db, items, conflict);
                first = false;
                continue;
            }
            try {
                write(db, items, conflict);
            } catch (RuntimeException ex) {
                missed.add("Coach " + coach.name().firstName());
            }
        }
        if (!missed.isEmpty()) {
            throw DomainException.conflict(done + ", but we couldn’t send your request to " + String.join(", ", missed)
                    + ". Add them again from Profile → Add a coach.");
        }
    }

    private static void write(DynamoDbClient db, List<TransactWriteItem> writes, String conflict) {
        try {
            db.transactWriteItems(TransactWriteItemsRequest.builder().transactItems(writes).build());
        } catch (TransactionCanceledException e) {
            if (e.hasCancellationReasons() && e.cancellationReasons().stream().anyMatch(r -> "ConditionalCheckFailed".equals(r.code()))) {
                throw DomainException.conflict(conflict);
            }
            throw e;
        }
    }

    /** The family's own name and phone. The login email changes through Cognito, not here. */
    public void updateContact(ClientContext ctx, String firstName, String lastName, String phone) {
        try {
            clients.clientFor(ctx).transactWriteItems(TransactWriteItemsRequest.builder().transactItems(
                    TransactWriteItem.builder().update(Update.builder().tableName(table)
                            .key(FamilyItems.key(ctx.partitionKey(), FamilyItems.PROFILE))
                            .conditionExpression("attribute_exists(PK)")
                            .updateExpression("SET firstName = :f, lastName = :l, clientName = :n, clientPhone = :p")
                            .expressionAttributeValues(Map.of(":f", FamilyItems.s(firstName), ":l", FamilyItems.s(lastName),
                                    ":n", FamilyItems.s(firstName + " " + lastName), ":p", FamilyItems.s(phone)))
                            .build()).build()).build());
        } catch (TransactionCanceledException e) {
            throw DomainException.notFound("Finish signing up first.");
        }
    }

    // ------------------------------------------------------------------- reads

    public Optional<FamilyAccount> account(ClientContext ctx) {
        return FamilyItems.account(queryPartition(clients.clientFor(ctx), table, ctx.partitionKey()));
    }

    /** The coaches the family is linked to, with its standing with each, from its own link items. */
    public List<LinkedCoach> linkedCoaches(ClientContext ctx) {
        FamilyStanding standing = account(ctx).map(FamilyAccount::standing).orElse(FamilyStanding.of(List.of()));
        List<LinkedCoach> out = new ArrayList<>();
        for (String coachId : standing.coachIds()) {
            out.add(new LinkedCoach(coachId, standing.statusWith(coachId).orElseThrow()));
        }
        return out;
    }

    /**
     * The coach profile's public fields, only while the family is {@code ACTIVE} with that coach. A
     * waiting family reads nothing of the coach (ADR-MASTER section 16): this returns empty, as the
     * policy would refuse.
     */
    public Optional<CoachPublicProfile> coachProfile(ClientContext ctx, LinkedCoach coach) {
        if (!coach.active()) {
            return Optional.empty();
        }
        List<String> fields = new ArrayList<>(List.of("firstName", "lastName", "phone", "businessEmail",
                "displayPhoneToClients", "displayEmailToClients"));
        for (Type t : Type.values()) {
            fields.add(t.switchField());
            if (t.hasHandle()) {
                fields.add(t.handleField());
            }
        }
        Map<String, AttributeValue> m = clients.clientFor(ctx, coach).getItem(GetItemRequest.builder().tableName(table)
                .key(FamilyItems.key("COACH#" + coach.coachId(), "PROFILE"))
                .projectionExpression(String.join(", ", fields)).build()).item();
        if (m == null || m.isEmpty()) {
            return Optional.empty();
        }
        Set<Type> on = EnumSet.noneOf(Type.class);
        Map<Type, String> handles = new EnumMap<>(Type.class);
        for (Type t : Type.values()) {
            if (FamilyItems.bool(m, t.switchField())) {
                on.add(t);
                if (t.hasHandle() && m.containsKey(t.handleField())) {
                    handles.put(t, FamilyItems.str(m, t.handleField()));
                }
            }
        }
        return Optional.of(new CoachPublicProfile(FamilyItems.str(m, "firstName"), FamilyItems.str(m, "lastName"),
                FamilyItems.str(m, "phone"), FamilyItems.str(m, "businessEmail"),
                FamilyItems.bool(m, "displayPhoneToClients"), FamilyItems.bool(m, "displayEmailToClients"),
                PaymentTypes.of(on, handles)));
    }

    // ----------------------------------------------------------------- helpers

    private TransactWriteItem put(Map<String, AttributeValue> item) {
        return TransactWriteItem.builder().put(Put.builder().tableName(table).item(item)
                .conditionExpression("attribute_not_exists(PK)").build()).build();
    }

    /** Every item in one partition, consistently read. */
    static List<Map<String, AttributeValue>> queryPartition(DynamoDbClient db, String table, String pk) {
        List<Map<String, AttributeValue>> items = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db.query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(pk)))
                    .exclusiveStartKey(start).build());
            items.addAll(r.items());
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return items;
    }
}
