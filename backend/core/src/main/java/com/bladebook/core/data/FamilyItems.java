package com.bladebook.core.data;

import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.SkatingOrg;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.domain.DomainException;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The family items and the coach's {@code STUDENT#} record as DynamoDB attributes (ADR-MASTER section 3):
 * <ul>
 *   <li>{@code CLIENT#<sub> / PROFILE}</li>
 *   <li>{@code CLIENT#<sub> / SKATER#<studentId>}</li>
 *   <li>{@code CLIENT#<sub> / STUDENT#<coachId>#<studentId>}, the link</li>
 *   <li>{@code COACH#<coachId> / STUDENT#<studentId>}</li>
 * </ul>
 */
final class FamilyItems {

    static final String PROFILE = "PROFILE";
    static final String SKATER = "SKATER#";
    static final String STUDENT = "STUDENT#";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9-]{1,128}$");

    private FamilyItems() {
    }

    /** A student ID from a request path, before it goes into a key. */
    static String safeStudentId(String id) {
        if (id == null || !SAFE_ID.matcher(id).matches()) {
            throw DomainException.invalid("studentId", "That skater couldn’t be found. Reload the page.");
        }
        return id;
    }

    static Map<String, AttributeValue> key(String pk, String sk) {
        return Map.of("PK", s(pk), "SK", s(sk));
    }

    static Map<String, AttributeValue> linkKey(String clientId, String coachId, String studentId) {
        return key("CLIENT#" + clientId, STUDENT + coachId + "#" + studentId);
    }

    static Map<String, AttributeValue> studentKey(String coachId, String studentId) {
        return key("COACH#" + coachId, STUDENT + studentId);
    }

    // ------------------------------------------------------------------ to items

    static Map<String, AttributeValue> profileItem(FamilyProfile p) {
        Map<String, AttributeValue> m = new HashMap<>(key("CLIENT#" + p.clientId(), PROFILE));
        m.put("firstName", s(p.firstName()));
        m.put("lastName", s(p.lastName()));
        m.put("clientName", s(p.fullName()));
        m.put("clientEmail", s(p.email()));
        m.put("clientPhone", s(p.phone()));
        m.put("clientRelationship", s(p.relationship().name()));
        m.put("createdAt", s(p.createdAt().toString()));
        return m;
    }

    static Map<String, AttributeValue> skaterItem(String clientId, ClientRelationship rel, Skater k) {
        Map<String, AttributeValue> m = new HashMap<>(key("CLIENT#" + clientId, SKATER + k.studentId()));
        m.put("studentId", s(k.studentId()));
        m.put("studentName", s(k.name()));
        m.put("isMinor", AttributeValue.fromBool(k.isMinor()));
        m.put("clientRelationship", s(rel.name()));
        m.put("skatingOrg", s(k.skatingOrg().name()));
        m.put("registrationNumber", s(k.registrationNumber()));
        return m;
    }

    static Map<String, AttributeValue> linkItem(StudentRecord r, CoachName coach) {
        Map<String, AttributeValue> m = new HashMap<>(linkKey(r.clientId(), r.coachId(), r.studentId()));
        m.put("coachId", s(r.coachId()));
        m.put("studentId", s(r.studentId()));
        m.put("studentName", s(r.studentName()));
        m.put("studentStatus", s(r.status().name()));
        m.put("coachFirstName", s(coach.firstName()));
        m.put("coachLastName", s(coach.lastName()));
        return m;
    }

    static Map<String, AttributeValue> studentItem(StudentRecord r) {
        Map<String, AttributeValue> m = new HashMap<>(studentKey(r.coachId(), r.studentId()));
        m.put("studentId", s(r.studentId()));
        m.put("clientId", s(r.clientId()));
        m.put("studentStatus", s(r.status().name()));
        m.put("studentName", s(r.studentName()));
        m.put("isMinor", AttributeValue.fromBool(r.isMinor()));
        m.put("clientRelationship", s(r.relationship().name()));
        m.put("clientName", s(r.clientName()));
        m.put("clientEmail", s(r.clientEmail()));
        m.put("clientPhone", s(r.clientPhone()));
        m.put("skatingOrg", s(r.skatingOrg().name()));
        m.put("registrationNumber", s(r.registrationNumber()));
        m.put("signedUpAt", s(r.signedUpAt().toString()));
        return m;
    }

    // ---------------------------------------------------------------- from items

    /** The items of one family partition, as a query returns them. */
    static Optional<FamilyAccount> account(List<Map<String, AttributeValue>> items) {
        FamilyProfile profile = null;
        List<Skater> skaters = new ArrayList<>();
        List<SkaterLink> links = new ArrayList<>();
        for (Map<String, AttributeValue> m : items) {
            String sk = m.get("SK").s();
            if (sk.equals(PROFILE)) {
                profile = profile(m);
            } else if (sk.startsWith(SKATER)) {
                skaters.add(skater(m));
            } else if (sk.startsWith(STUDENT)) {
                links.add(link(m));
            }
        }
        return profile == null ? Optional.empty() : Optional.of(new FamilyAccount(profile, skaters, links));
    }

    static FamilyProfile profile(Map<String, AttributeValue> m) {
        return new FamilyProfile(m.get("PK").s().substring("CLIENT#".length()), str(m, "firstName"), str(m, "lastName"),
                str(m, "clientEmail"), str(m, "clientPhone"), ClientRelationship.parse(str(m, "clientRelationship")),
                Instant.parse(str(m, "createdAt")));
    }

    static Skater skater(Map<String, AttributeValue> m) {
        return new Skater(str(m, "studentId"), str(m, "studentName"), bool(m, "isMinor"),
                SkatingOrg.parse(str(m, "skatingOrg")), str(m, "registrationNumber"), str(m, "shareCode"));
    }

    static SkaterLink link(Map<String, AttributeValue> m) {
        return new SkaterLink(str(m, "coachId"), str(m, "studentId"), str(m, "studentName"),
                StudentStatus.parse(str(m, "studentStatus")), str(m, "coachFirstName"), str(m, "coachLastName"));
    }

    static StudentRecord student(Map<String, AttributeValue> m) {
        return new StudentRecord(m.get("PK").s().substring("COACH#".length()), str(m, "studentId"), str(m, "clientId"),
                StudentStatus.parse(str(m, "studentStatus")), str(m, "studentName"), bool(m, "isMinor"),
                ClientRelationship.parse(str(m, "clientRelationship")), str(m, "clientName"), str(m, "clientEmail"),
                str(m, "clientPhone"), SkatingOrg.parse(str(m, "skatingOrg")), str(m, "registrationNumber"),
                Instant.parse(str(m, "signedUpAt")));
    }

    static AttributeValue s(String v) {
        return AttributeValue.fromS(v);
    }

    static String str(Map<String, AttributeValue> m, String k) {
        AttributeValue v = m.get(k);
        return v == null ? null : v.s();
    }

    static boolean bool(Map<String, AttributeValue> m, String k) {
        AttributeValue v = m.get(k);
        return v != null && Boolean.TRUE.equals(v.bool());
    }
}
