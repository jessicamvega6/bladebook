package com.bladebook.core.data;

import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkatingOrg;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Families and coaches for the data tests. */
final class FamilyTestData {

    static final Instant SIGNED_UP = Instant.parse("2026-11-09T15:00:00Z");

    private FamilyTestData() {
    }

    /** A coach whose code works, written through CoachRepository. */
    static AccessContext coach(DynamoDbLocal.Fixture f, String first, String code) {
        AccessContext ctx = new AccessContext(UUID.randomUUID().toString());
        new CoachRepository(f.clients, f.table).create(ctx, CoachProfile.builder().coachId(ctx.coachId())
                .firstName(first).lastName("Whitfield").loginEmail(first.toLowerCase() + "@gmail.com")
                .businessEmail(first.toLowerCase() + "@gmail.com").phone("(205) 555-0142")
                .coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD)
                .coachCode(CoachCode.parse(code)).displayPhoneToClients(true).build());
        return ctx;
    }

    static FamilyProfile profile(ClientContext ctx) {
        return new FamilyProfile(ctx.clientId(), "Sarah", "Park", "sarah@example.com", "(205) 555-0196",
                ClientRelationship.GUARDIAN, SIGNED_UP);
    }

    static Skater skater(String name) {
        return new Skater(UUID.randomUUID().toString(), name, true, SkatingOrg.USFS, "1234567");
    }

    static StudentRecord pending(String coachId, Skater s, FamilyProfile p) {
        return new StudentRecord(coachId, s.studentId(), p.clientId(), StudentStatus.PENDING, s.name(), s.isMinor(),
                p.relationship(), p.fullName(), p.email(), p.phone(), s.skatingOrg(), s.registrationNumber(), p.createdAt());
    }

    /** The coach approves the skater, and the family's link follows, as consumer-student-link does. */
    static void approve(DynamoDbLocal.Fixture f, AccessContext coach, ClientContext family, Skater s) {
        new StudentRepository(f.clients, f.table).approve(coach, s.studentId());
        new SyncRepository(f.clients, f.table).setLinkStatus(family.clientId(), coach.coachId(), s.studentId(), StudentStatus.ACTIVE);
    }

    /** One open lesson time in the coach's partition, as a schedule save makes it. */
    static LessonTime openTime(DynamoDbLocal.Fixture f, AccessContext coach, LocalDate date, LocalTime start, int price, int maxSkaters) {
        Instant startsAt = date.atTime(start).atZone(ZoneId.of("America/Chicago")).toInstant();
        LessonTime t = new LessonTime(date, start, startsAt, "America/Chicago", 30, price, "USD", 0, 24, maxSkaters, 0, 1,
                IceType.PUBLIC, 1, LessonTime.Status.OPEN);
        new ScheduleRepository(f.clients, f.table).apply(coach, new ScheduleChange(List.of(t), List.of(), List.of(), 0));
        return t;
    }

    /** Registers a family with each skater joining every coach given. */
    static ClientContext register(DynamoDbLocal.Fixture f, List<Skater> skaters, AccessContext... coaches) {
        ClientContext ctx = new ClientContext(UUID.randomUUID().toString());
        FamilyProfile p = profile(ctx);
        List<StudentRecord> students = new ArrayList<>();
        Map<String, CoachName> names = new java.util.HashMap<>();
        for (AccessContext c : coaches) {
            names.put(c.coachId(), new CoachName("Dana", "Whitfield"));
            for (Skater s : skaters) {
                students.add(pending(c.coachId(), s, p));
            }
        }
        new FamilyRepository(f.clients, f.table).register(ctx, p, skaters, students, names);
        return ctx;
    }
}
