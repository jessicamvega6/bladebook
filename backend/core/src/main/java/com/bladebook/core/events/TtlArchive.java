package com.bladebook.core.events;

import com.bladebook.core.data.TableRecord;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Tag;
import software.amazon.awssdk.services.s3.model.Tagging;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

/**
 * {@code consumer-ttl-archiver} (ADR-MASTER sections 2, 3 and 20): the table stream's second reader. It acts on TTL
 * removals only (a {@code REMOVE} by the DynamoDB service) and writes each removed item's old image, as DynamoDB's typed
 * JSON, to one object in the archive bucket:
 * <pre>coach=&lt;coachId&gt;/student=&lt;studentId|none&gt;/type=&lt;itemType&gt;/&lt;yyyy-mm-dd&gt;/&lt;itemKeyHash&gt;.json</pre>
 * The date is the removal's, and the name is a hash of the item's key, so a retried batch writes the same objects again.
 * It reads nothing from the table and writes nothing to it.
 */
public final class TtlArchive {

    /** Where objects go: the archive bucket on AWS. Throws if the object wasn't stored. */
    @FunctionalInterface
    public interface Store {
        void put(String key, String body, Map<String, String> tags);
    }

    /** One batch: items archived, and records that weren't TTL removals (there shouldn't be any: the filter drops them). */
    public record Archived(int archived, int ignored) {
    }

    /** The identity DynamoDB gives its own TTL deletes on the stream. */
    static final String TTL_PRINCIPAL = "dynamodb.amazonaws.com";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Store store;

    public TtlArchive(Store store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    /** On Lambda: the archive bucket from {@code BLADEBOOK_ARCHIVEBUCKET} (set by {@code infra/lib/consumers.ts}). */
    public static TtlArchive fromEnvironment() {
        return fromEnvironment(System::getenv);
    }

    static TtlArchive fromEnvironment(Function<String, String> env) {
        String bucket = env.apply("BLADEBOOK_ARCHIVEBUCKET");
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalStateException("BLADEBOOK_ARCHIVEBUCKET is not set");
        }
        S3Client s3 = S3Client.builder().httpClient(UrlConnectionHttpClient.create())
                .region(new DefaultAwsRegionProviderChain().getRegion()).build();
        return new TtlArchive((key, body, tags) -> s3.putObject(r -> r.bucket(bucket).key(key).contentType("application/json")
                        .tagging(Tagging.builder().tagSet(tags.entrySet().stream()
                                .map(e -> Tag.builder().key(e.getKey()).value(e.getValue()).build()).toList()).build()),
                RequestBody.fromString(body, StandardCharsets.UTF_8)));
    }

    /** A batch from the stream ({@code {"Records": [...]}}). Throws on the first object it can't store, so Lambda retries. */
    public Archived run(String json) {
        JsonNode records = JSON.readTree(Objects.requireNonNull(json, "json")).get("Records");
        if (records == null || !records.isArray()) {
            throw new IllegalArgumentException("not a DynamoDB stream batch");
        }
        int archived = 0;
        int ignored = 0;
        for (JsonNode rec : records) {
            if (!isTtlRemoval(rec)) {
                ignored++;
                continue;
            }
            TableRecord r = TableRecord.parse(rec.toString());
            JsonNode ddb = rec.get("dynamodb");
            Instant at = ddb.has("ApproximateCreationDateTime")
                    ? Instant.ofEpochSecond(ddb.get("ApproximateCreationDateTime").asLong()) : Instant.now();
            String type = itemType(r.sk());
            store.put(objectKey(r, at), ddb.get("OldImage").toString(), Map.of("itemType", type));
            archived++;
        }
        return new Archived(archived, ignored);
    }

    static boolean isTtlRemoval(JsonNode rec) {
        JsonNode who = rec.get("userIdentity");
        return "REMOVE".equals(rec.path("eventName").asString()) && who != null
                && "Service".equals(who.path("type").asString()) && TTL_PRINCIPAL.equals(who.path("principalId").asString())
                && rec.path("dynamodb").has("OldImage");
    }

    /** {@code coach=…/student=…/type=…/<date>/<hash>.json} (ADR-MASTER section 20). */
    static String objectKey(TableRecord r, Instant removedAt) {
        String coach = r.pk().startsWith("COACH#") ? r.partitionId() : "none";
        String student = r.oldString("studentId").orElse("none");
        return "coach=" + coach + "/student=" + student + "/type=" + itemType(r.sk()) + "/"
                + LocalDate.ofInstant(removedAt, ZoneOffset.UTC) + "/" + hash(r.pk() + "\u0000" + r.sk()) + ".json";
    }

    /** The sort key's first part: {@code LESSON}, {@code SEAT}, {@code CHANGEBATCH}, {@code SCHEDULE}... */
    static String itemType(String sk) {
        int hash = sk.indexOf('#');
        return hash < 0 ? sk : sk.substring(0, hash);
    }

    static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
