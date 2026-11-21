package com.bladebook.core.data;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import software.amazon.awssdk.awscore.exception.AwsErrorDetails;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemResponse;
import software.amazon.awssdk.services.dynamodb.model.DynamoDbException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ReturnValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.dynamodb.model.Select;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemResponse;

/**
 * Local mode's stand-in for {@code client-tenant}'s and {@code code-lookup}'s IAM policies (ADR-022, ADR-MASTER section 16),
 * so a family read that AWS would refuse fails locally and in tests too, with the same {@code AccessDeniedException}. It
 * plays what the policies say, as {@code infra/lib/tenant-roles.ts} builds them:
 * <ul>
 *   <li>the family's own partition ({@code CLIENT#<clientId>}) and its own GSI1 entries: anything;</li>
 *   <li>its coach's partition, in the second session ({@code coachId} tagged) and only while the link is {@code ACTIVE}:
 *       reads that name only the allowlisted attributes ({@code Select = SPECIFIC_ATTRIBUTES}); writes, returning
 *       nothing;</li>
 *   <li>{@code CODE#} and {@code SKATERCODE#} items: a {@code GetItem} of their allowlisted attributes;</li>
 *   <li>nothing else: no other partition, no other index, no {@code Scan}.</li>
 * </ul>
 * The allowlists come from {@code bladebook/client-read-allowlist.json}, the same file the role is built from. It checks
 * the attributes a request names in its projection, which is what {@code dynamodb:Attributes} sees on a read.
 */
final class LocalFamilyPolicy implements DynamoDbClient {

    /** The three allowlists, from the one file the role is built from too. */
    record Allowlist(Set<String> coachPublic, Set<String> coachCode, Set<String> skaterCode) {

        static final Allowlist LOADED = load();

        private static Allowlist load() {
            try (InputStream in = LocalFamilyPolicy.class.getResourceAsStream("/bladebook/client-read-allowlist.json")) {
                if (in == null) {
                    throw new IllegalStateException("bladebook/client-read-allowlist.json is missing");
                }
                JsonNode n = JsonMapper.builder().build().readTree(in);
                return new Allowlist(set(n, "coachPublic"), set(n, "coachCode"), set(n, "skaterCode"));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        private static Set<String> set(JsonNode n, String field) {
            Set<String> out = new LinkedHashSet<>();
            n.get(field).forEach(v -> out.add(v.asString()));
            return Set.copyOf(out);
        }
    }

    private static final Pattern EQUALS = Pattern.compile("(#?[A-Za-z0-9_]+)\\s*=\\s*(:[A-Za-z0-9_]+)");

    private final DynamoDbClient db;
    /** Null for {@code code-lookup}, which has no family. */
    private final String clientId;
    /** Null in the first session, which isn't tagged with a coach. */
    private final String coachId;
    private final boolean active;
    private final boolean codeLookup;

    private LocalFamilyPolicy(DynamoDbClient db, String clientId, String coachId, boolean active, boolean codeLookup) {
        this.db = db;
        this.clientId = clientId;
        this.coachId = coachId;
        this.active = active;
        this.codeLookup = codeLookup;
    }

    /** The first {@code client-tenant} session: tagged with the family only. */
    static LocalFamilyPolicy family(DynamoDbClient db, String clientId) {
        return new LocalFamilyPolicy(db, clientId, null, false, false);
    }

    /** The second {@code client-tenant} session: tagged with the family, the coach and its standing. */
    static LocalFamilyPolicy familyWithCoach(DynamoDbClient db, String clientId, String coachId, boolean active) {
        return new LocalFamilyPolicy(db, clientId, coachId, active, false);
    }

    /** {@code code-lookup}: before sign-in, a {@code CODE#} item's name fields only. */
    static LocalFamilyPolicy codeLookup(DynamoDbClient db) {
        return new LocalFamilyPolicy(db, null, null, false, true);
    }

    // ------------------------------------------------------------------ reads

    @Override
    public GetItemResponse getItem(GetItemRequest r) {
        read("GetItem", pk(r.key()), named(r.projectionExpression(), r.expressionAttributeNames(), r.attributesToGet()), true);
        return db.getItem(r);
    }

    @Override
    public BatchGetItemResponse batchGetItem(BatchGetItemRequest r) {
        r.requestItems().forEach((t, keys) -> {
            Set<String> names = named(keys.projectionExpression(), keys.expressionAttributeNames(), keys.attributesToGet());
            keys.keys().forEach(k -> read("BatchGetItem", pk(k), names, false));
        });
        return db.batchGetItem(r);
    }

    @Override
    public QueryResponse query(QueryRequest r) {
        if (r.indexName() != null) {
            String partition = partition(r, "GSI1PK");
            if (codeLookup || !"GSI1".equals(r.indexName()) || !("CLIENT#" + clientId).equals(partition)) {
                throw denied("Query on " + r.indexName() + " for " + partition);
            }
            return db.query(r);
        }
        Set<String> names = r.select() == Select.ALL_ATTRIBUTES ? null
                : named(r.projectionExpression(), r.expressionAttributeNames(), r.attributesToGet());
        read("Query", partition(r, "PK"), names, false);
        return db.query(r);
    }

    @Override
    public ScanResponse scan(ScanRequest r) {
        throw denied("Scan");
    }

    /**
     * {@code names} is null when the request names no attributes (a whole-item read). {@code code} is whether the
     * code statements, which allow {@code GetItem} only, can apply.
     */
    private void read(String action, String pk, Set<String> names, boolean code) {
        if (!codeLookup && pk.equals("CLIENT#" + clientId)) {
            return;
        }
        Allowlist a = Allowlist.LOADED;
        if (code && pk.startsWith("CODE#") && within(names, a.coachCode())) {
            return;
        }
        if (code && !codeLookup && pk.startsWith("SKATERCODE#") && within(names, a.skaterCode())) {
            return;
        }
        if (!codeLookup && coachId != null && active && pk.equals("COACH#" + coachId) && within(names, a.coachPublic())) {
            return;
        }
        throw denied(action + " of " + (names == null ? "every attribute" : names) + " in " + pk);
    }

    private static boolean within(Set<String> names, Set<String> allowed) {
        return names != null && !names.isEmpty() && allowed.containsAll(names);
    }

    // ------------------------------------------------------------------ writes

    @Override
    public PutItemResponse putItem(PutItemRequest r) {
        write("PutItem", pk(r.item()), r.returnValues());
        return db.putItem(r);
    }

    @Override
    public UpdateItemResponse updateItem(UpdateItemRequest r) {
        write("UpdateItem", pk(r.key()), r.returnValues());
        return db.updateItem(r);
    }

    @Override
    public DeleteItemResponse deleteItem(DeleteItemRequest r) {
        write("DeleteItem", pk(r.key()), r.returnValues());
        return db.deleteItem(r);
    }

    @Override
    public TransactWriteItemsResponse transactWriteItems(TransactWriteItemsRequest r) {
        for (TransactWriteItem t : r.transactItems()) {
            if (t.put() != null) {
                write("PutItem", pk(t.put().item()), null);
            } else if (t.update() != null) {
                write("UpdateItem", pk(t.update().key()), null);
            } else if (t.delete() != null) {
                write("DeleteItem", pk(t.delete().key()), null);
            } else if (t.conditionCheck() != null) {
                write("ConditionCheckItem", pk(t.conditionCheck().key()), null);
            }
        }
        return db.transactWriteItems(r);
    }

    private void write(String action, String pk, ReturnValue returns) {
        if (!codeLookup && pk.equals("CLIENT#" + clientId)) {
            return;
        }
        boolean nothingBack = returns == null || returns == ReturnValue.NONE;
        if (!codeLookup && coachId != null && pk.equals("COACH#" + coachId) && nothingBack) {
            return;
        }
        throw denied(action + " in " + pk + (nothingBack ? "" : " returning " + returns));
    }

    // ------------------------------------------------------------------ helpers

    private static String pk(Map<String, AttributeValue> key) {
        AttributeValue v = key == null ? null : key.get("PK");
        return v == null || v.s() == null ? "" : v.s();
    }

    /** The partition a query names: the value its key condition gives {@code keyName}. */
    private static String partition(QueryRequest r, String keyName) {
        String expr = r.keyConditionExpression();
        if (expr == null) {
            return "";
        }
        Matcher m = EQUALS.matcher(expr);
        while (m.find()) {
            String name = m.group(1).startsWith("#") ? r.expressionAttributeNames().get(m.group(1)) : m.group(1);
            if (keyName.equals(name)) {
                AttributeValue v = r.expressionAttributeValues().get(m.group(2));
                return v == null || v.s() == null ? "" : v.s();
            }
        }
        return "";
    }

    /** The top-level attributes a projection names, or null when it names none (a whole-item read). */
    static Set<String> named(String projection, Map<String, String> aliases, List<String> attributesToGet) {
        Set<String> out = new HashSet<>();
        if (attributesToGet != null) {
            out.addAll(attributesToGet);
        }
        if (projection != null && !projection.isBlank()) {
            for (String part : projection.split(",")) {
                String top = part.trim().split("[.\\[]", 2)[0];
                out.add(top.startsWith("#") && aliases != null ? aliases.getOrDefault(top, top) : top);
            }
        }
        return out.isEmpty() ? null : out;
    }

    private static DynamoDbException denied(String what) {
        String message = "Local mode refused what client-tenant would refuse on AWS (ADR-022): " + what;
        return (DynamoDbException) DynamoDbException.builder().message(message).statusCode(400)
                .awsErrorDetails(AwsErrorDetails.builder().errorCode("AccessDeniedException").errorMessage(message)
                        .serviceName("DynamoDb").build())
                .build();
    }

    @Override
    public String serviceName() {
        return db.serviceName();
    }

    @Override
    public void close() {
        // The shared local client outlives each request.
    }
}
