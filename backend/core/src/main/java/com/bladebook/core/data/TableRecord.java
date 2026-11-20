package com.bladebook.core.data;

import com.bladebook.core.domain.StudentRecord;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * One table stream record, as the Pipe puts it on the bus unchanged (ADR-MASTER section 3, I6): the shared reader every
 * event consumer uses. It turns DynamoDB's typed JSON ({@code {"S": "..."}}, {@code {"N": "..."}}, ...) back into the
 * attribute values the repositories read, so a consumer reads an image with the same code that reads the table.
 *
 * <p>Takes either the EventBridge event (the record is its {@code detail}) or the bare stream record.
 */
public final class TableRecord {

    /** The stream's {@code eventName}. */
    public enum Change { INSERT, MODIFY, REMOVE }

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Change change;
    private final String pk;
    private final String sk;
    private final Map<String, AttributeValue> newImage;
    private final Map<String, AttributeValue> oldImage;

    private TableRecord(Change change, String pk, String sk, Map<String, AttributeValue> newImage,
                        Map<String, AttributeValue> oldImage) {
        this.change = change;
        this.pk = pk;
        this.sk = sk;
        this.newImage = newImage;
        this.oldImage = oldImage;
    }

    /** Reads an EventBridge event carrying a stream record, or a bare stream record. Throws if it is neither. */
    public static TableRecord parse(String json) {
        JsonNode root = JSON.readTree(Objects.requireNonNull(json, "json"));
        JsonNode record = root.has("detail") ? root.get("detail") : root;
        JsonNode ddb = record.get("dynamodb");
        if (ddb == null || !record.has("eventName")) {
            throw new IllegalArgumentException("not a DynamoDB stream record");
        }
        Change change = Change.valueOf(record.get("eventName").asString());
        Map<String, AttributeValue> keys = image(ddb.get("Keys"));
        if (!keys.containsKey("PK") || !keys.containsKey("SK")) {
            throw new IllegalArgumentException("stream record without PK and SK");
        }
        return new TableRecord(change, keys.get("PK").s(), keys.get("SK").s(), image(ddb.get("NewImage")),
                image(ddb.get("OldImage")));
    }

    public Change change() {
        return change;
    }

    public String pk() {
        return pk;
    }

    public String sk() {
        return sk;
    }

    /** The ID after the partition's prefix: the coach's for {@code COACH#...}, the family's for {@code CLIENT#...}. */
    public String partitionId() {
        int hash = pk.indexOf('#');
        return hash < 0 ? pk : pk.substring(hash + 1);
    }

    /** A string attribute of the new image; empty if it has none (a removal). */
    public Optional<String> newString(String attribute) {
        return str(newImage, attribute);
    }

    /** A string attribute of the old image; empty if it has none (an insert). */
    public Optional<String> oldString(String attribute) {
        return str(oldImage, attribute);
    }

    public boolean hasNewImage() {
        return !newImage.isEmpty();
    }

    public boolean hasOldImage() {
        return !oldImage.isEmpty();
    }

    /** The coach's skater record before the change ({@code COACH#... / STUDENT#...}); empty for an insert. */
    public Optional<StudentRecord> oldStudent() {
        return student(oldImage);
    }

    /** The coach's skater record after the change; empty for a removal. */
    public Optional<StudentRecord> newStudent() {
        return student(newImage);
    }

    private Optional<StudentRecord> student(Map<String, AttributeValue> image) {
        if (image.isEmpty() || !pk.startsWith("COACH#") || !sk.startsWith("STUDENT#")) {
            return Optional.empty();
        }
        return Optional.of(FamilyItems.student(image));
    }

    private static Optional<String> str(Map<String, AttributeValue> image, String attribute) {
        AttributeValue v = image.get(attribute);
        return v == null || v.s() == null ? Optional.empty() : Optional.of(v.s());
    }

    // ------------------------------------------------------------------------------------------- DynamoDB's JSON

    static Map<String, AttributeValue> image(JsonNode node) {
        Map<String, AttributeValue> m = new LinkedHashMap<>();
        if (node == null || node.isNull()) {
            return m;
        }
        for (Map.Entry<String, JsonNode> e : node.properties()) {
            m.put(e.getKey(), value(e.getValue()));
        }
        return m;
    }

    static AttributeValue value(JsonNode typed) {
        if (typed == null || !typed.isObject() || typed.size() != 1) {
            throw new IllegalArgumentException("not a typed DynamoDB value");
        }
        Map.Entry<String, JsonNode> e = typed.properties().iterator().next();
        JsonNode v = e.getValue();
        return switch (e.getKey()) {
            case "S" -> AttributeValue.fromS(v.asString());
            case "N" -> AttributeValue.fromN(v.asString());
            case "BOOL" -> AttributeValue.fromBool(v.asBoolean());
            case "NULL" -> AttributeValue.fromNul(true);
            case "B" -> AttributeValue.fromB(SdkBytes.fromByteArray(Base64.getDecoder().decode(v.asString())));
            case "M" -> AttributeValue.fromM(image(v));
            case "L" -> {
                List<AttributeValue> l = new ArrayList<>();
                v.forEach(x -> l.add(value(x)));
                yield AttributeValue.fromL(l);
            }
            case "SS" -> AttributeValue.fromSs(strings(v));
            case "NS" -> AttributeValue.fromNs(strings(v));
            case "BS" -> {
                List<SdkBytes> l = new ArrayList<>();
                v.forEach(x -> l.add(SdkBytes.fromByteArray(Base64.getDecoder().decode(x.asString()))));
                yield AttributeValue.fromBs(l);
            }
            default -> throw new IllegalArgumentException("unknown DynamoDB type " + e.getKey());
        };
    }

    private static List<String> strings(JsonNode array) {
        List<String> l = new ArrayList<>();
        array.forEach(x -> l.add(x.asString()));
        return l;
    }

    @Override
    public String toString() {
        return "TableRecord[" + change + " " + pk + " / " + sk + "]"; // keys only: the images hold personal data
    }
}
