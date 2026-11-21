package com.bladebook.core.data;

import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.WeeklySchedule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@code SCHEDULE#DEFAULT}, {@code SCHEDULE#DATE#} and {@code LESSON#} items on DynamoDB Local. */
class ScheduleRepositoryTest {

    private ScheduleRepository repo;
    private DynamoDbClient db;
    private String table;
    private AccessContext ctx;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        repo = new ScheduleRepository(f.clients, f.table);
        db = f.clients.forSetup();
        table = f.table;
        ctx = new AccessContext(UUID.randomUUID().toString());
    }

    private static ScheduleBlock block(int seq, String name, int startHour, int endHour) {
        return new ScheduleBlock(seq, name, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), 30, 4501, 0, 2, IceType.STICK_AND_PUCK);
    }

    private static WeeklySchedule week(long version) {
        return new WeeklySchedule(Map.of(
                DayOfWeek.MONDAY, List.of(block(1, "Morning ice", 6, 8), block(2, null, 15, 17)),
                DayOfWeek.SATURDAY, List.of(block(1, "Morning ice", 7, 9))), version);
    }

    private static LessonTime lesson(LocalDate date, int hour, int price) {
        return new LessonTime(date, LocalTime.of(hour, 0), date.atTime(hour, 0).toInstant(java.time.ZoneOffset.ofHours(-6)),
                "America/Chicago", 30, price, "USD", 0, 24, 2, 0, 1, IceType.PUBLIC, 1, LessonTime.Status.OPEN);
    }

    private static final LocalDate MON = LocalDate.of(2026, 11, 9);

    private void setStatus(LessonTime t, String status) {
        db.updateItem(UpdateItemRequest.builder().tableName(table)
                .key(Map.of("PK", AttributeValue.fromS(ctx.partitionKey()), "SK", AttributeValue.fromS(t.key())))
                .updateExpression("SET lessonStatus = :s").expressionAttributeValues(Map.of(":s", AttributeValue.fromS(status)))
                .build());
    }

    // ---- the default schedule ----

    @Test
    void aCoachWithNoScheduleHasNone() {
        assertThat(repo.findDefault(ctx)).isEmpty();
    }

    @Test
    void theFirstSaveIsVersionOneAndReadsBackTheSame() {
        repo.saveDefault(ctx, week(1));
        assertThat(repo.findDefault(ctx)).contains(week(1));
    }

    @Test
    void eachSaveMustFollowTheVersionItRead() {
        repo.saveDefault(ctx, week(1));
        repo.saveDefault(ctx, week(2));
        assertThat(repo.findDefault(ctx).orElseThrow().scheduleVersion()).isEqualTo(2);

        assertThatThrownBy(() -> repo.saveDefault(ctx, week(2)))   // read version 1 in another window
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));
        assertThatThrownBy(() -> repo.saveDefault(ctx, week(1)))   // thought there was none yet
                .isInstanceOf(DomainException.class);
    }

    @Test
    void anEmptyWeekCanBeStored() {
        repo.saveDefault(ctx, new WeeklySchedule(Map.of(), 1));
        assertThat(repo.findDefault(ctx).orElseThrow().isEmpty()).isTrue();
    }

    @Test
    void oneCoachNeverSeesAnothersSchedule() {
        repo.saveDefault(ctx, week(1));
        assertThat(repo.findDefault(new AccessContext(UUID.randomUUID().toString()))).isEmpty();
    }

    // ---- date overrides ----

    @Test
    void overridesAreReadByDateIncludingEmptyOnes() {
        for (Object[] row : new Object[][] {{"2026-11-10", List.of(block(1, "Camp", 9, 12))}, {"2026-11-11", List.of()},
                {"2026-11-20", List.of(block(1, null, 9, 10))}}) {
            @SuppressWarnings("unchecked")
            List<ScheduleBlock> blocks = (List<ScheduleBlock>) row[1];
            Map<String, AttributeValue> item = new java.util.HashMap<>();
            item.put("PK", AttributeValue.fromS(ctx.partitionKey()));
            item.put("SK", AttributeValue.fromS("SCHEDULE#DATE#" + row[0]));
            item.put("blocks", ScheduleRepository.blocksAttr(blocks));
            db.putItem(PutItemRequest.builder().tableName(table).item(item).build());
        }

        Map<LocalDate, List<ScheduleBlock>> got = repo.overrides(ctx, LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 19));

        assertThat(got).containsOnlyKeys(LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 11));
        assertThat(got.get(LocalDate.of(2026, 11, 10))).containsExactly(block(1, "Camp", 9, 12));
        assertThat(got.get(LocalDate.of(2026, 11, 11))).isEmpty();
    }

    // ---- lesson times ----

    @Test
    void addedLessonTimesReadBackInTheirDateRange() {
        LessonTime a = lesson(MON, 6, 5000);
        LessonTime b = lesson(MON.plusDays(6), 23, 5000);
        LessonTime c = lesson(MON.plusDays(7), 6, 5000);
        ScheduleRepository.Applied done = repo.apply(ctx, new ScheduleChange(List.of(a, b, c), List.of(), List.of()));

        assertThat(done.added()).isEqualTo(3);
        assertThat(repo.lessonTimes(ctx, MON, MON.plusDays(6))).containsExactly(a, b);
    }

    @Test
    void manyLessonTimesAreWrittenInChunks() {
        List<LessonTime> many = new ArrayList<>();
        for (int d = 0; d < 15; d++) {
            for (int h = 0; h < 17; h++) {
                many.add(lesson(MON.plusDays(d), h + 6, 5000));
            }
        }
        repo.apply(ctx, new ScheduleChange(many, List.of(), List.of()));
        assertThat(repo.lessonTimes(ctx, MON, MON.plusDays(30))).hasSize(255);
    }

    @Test
    void addingATimeThatAlreadyExistsLeavesItAlone() {
        LessonTime a = lesson(MON, 6, 5000);
        repo.apply(ctx, new ScheduleChange(List.of(a), List.of(), List.of()));
        setStatus(a, "BOOKED");

        ScheduleRepository.Applied done = repo.apply(ctx, new ScheduleChange(List.of(a, lesson(MON, 7, 5000)), List.of(), List.of()));

        assertThat(done.added()).isEqualTo(1);
        assertThat(done.skipped()).isEqualTo(1);
        assertThat(repo.lessonTimes(ctx, MON, MON).get(0).lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void removeAndReplaceTouchOnlyTimesStillInTheStatusTheyWereRead() {
        LessonTime open = lesson(MON, 6, 5000);
        LessonTime bookedSince = lesson(MON, 7, 5000);
        LessonTime toReprice = lesson(MON, 8, 5000);
        LessonTime bookedBeforeReprice = lesson(MON, 9, 5000);
        repo.apply(ctx, new ScheduleChange(List.of(open, bookedSince, toReprice, bookedBeforeReprice), List.of(), List.of()));
        setStatus(bookedSince, "BOOKED");
        setStatus(bookedBeforeReprice, "BOOKED");

        ScheduleRepository.Applied done = repo.apply(ctx, new ScheduleChange(List.of(), List.of(open, bookedSince),
                List.of(toReprice.withPrice(4000), bookedBeforeReprice.withPrice(4000))));

        assertThat(done.removed()).isEqualTo(1);
        assertThat(done.replaced()).isEqualTo(1);
        assertThat(done.skipped()).isEqualTo(2);
        assertThat(repo.lessonTimes(ctx, MON, MON)).extracting(LessonTime::startTime, LessonTime::priceMinor).containsExactly(
                org.assertj.core.groups.Tuple.tuple(LocalTime.of(7, 0), 5000),
                org.assertj.core.groups.Tuple.tuple(LocalTime.of(8, 0), 4000),
                org.assertj.core.groups.Tuple.tuple(LocalTime.of(9, 0), 5000));
    }

    @Test
    void aHeldTimeIsRemovedOnlyWhileHeld() {
        LessonTime held = lesson(MON, 6, 5000);
        repo.apply(ctx, new ScheduleChange(List.of(held), List.of(), List.of()));
        setStatus(held, "HELD");
        LessonTime asRead = new LessonTime(held.lessonDate(), held.startTime(), held.startsAtUtc(), held.coachTz(), 30, 5000,
                "USD", 0, 24, 2, 0, 1, IceType.PUBLIC, 1, LessonTime.Status.HELD);

        assertThat(repo.apply(ctx, new ScheduleChange(List.of(), List.of(asRead), List.of())).removed()).isEqualTo(1);
        assertThat(repo.lessonTimes(ctx, MON, MON)).isEmpty();
    }

    @Test
    void aLessonTimeStoresEveryAttributeTheModelNames() {
        LessonTime a = lesson(MON, 6, 5000);
        repo.apply(ctx, new ScheduleChange(List.of(a), List.of(), List.of()));
        Map<String, AttributeValue> item = db.getItem(GetItemRequest.builder().tableName(table)
                .key(Map.of("PK", AttributeValue.fromS(ctx.partitionKey()), "SK", AttributeValue.fromS(a.key()))).build()).item();
        assertThat(item).containsKeys("lessonStatus", "lessonDate", "startTime", "startsAtUtc", "coachTz", "durationMinutes",
                "priceMinor", "currency", "missedLessonFeeMinor", "requiredNoticeHours", "maxSkaters", "seatsTaken",
                "shareCount", "blockSeq", "iceType", "scheduleVersion");
        assertThat(item.get("startsAtUtc").s()).isEqualTo("2026-11-09T12:00:00Z");
        assertThat(item).doesNotContainKeys("GSI2PK", "GSI2SK"); // an open time has no seats, so no day index keys
    }

    @Test
    void oneCoachsLessonTimesAreNotAnothers() {
        repo.apply(ctx, new ScheduleChange(List.of(lesson(MON, 6, 5000)), List.of(), List.of()));
        assertThat(repo.lessonTimes(new AccessContext(UUID.randomUUID().toString()), MON, MON)).isEmpty();
    }

    @Test
    void startsAtUtcIsKeptToTheSecond() {
        LessonTime a = lesson(MON, 6, 5000);
        repo.apply(ctx, new ScheduleChange(List.of(a), List.of(), List.of()));
        assertThat(repo.lessonTimes(ctx, MON, MON).get(0).startsAtUtc()).isEqualTo(Instant.parse("2026-11-09T12:00:00Z"));
    }

    @Test
    void longTimeOffIsWrittenInChunksWithItsHeaderLastAndAnEditReplacesEveryDate() {
        com.bladebook.core.domain.TempSchedule off = new com.bladebook.core.domain.TempSchedule("t1",
                com.bladebook.core.domain.TempSchedule.Kind.TIME_OFF, "Sabbatical", LocalDate.of(2026, 12, 1), LocalDate.of(2027, 3, 31),
                List.of(), java.util.Map.of());
        repo.saveTemp(ctx, off, null);
        assertThat(repo.overrides(ctx, LocalDate.of(2026, 12, 1), LocalDate.of(2027, 3, 31))).hasSize(121).allSatisfy((d, b) -> assertThat(b).isEmpty());
        assertThat(repo.temps(ctx)).containsExactly(off);

        com.bladebook.core.domain.TempSchedule shorter = new com.bladebook.core.domain.TempSchedule("t1",
                com.bladebook.core.domain.TempSchedule.Kind.TIME_OFF, "Sabbatical", LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 2),
                List.of(), java.util.Map.of());
        repo.saveTemp(ctx, shorter, off);
        assertThat(repo.overrides(ctx, LocalDate.of(2026, 12, 1), LocalDate.of(2027, 3, 31))).hasSize(2);
        assertThat(repo.temp(ctx, "t1")).contains(shorter);
    }

    @Test
    void anotherOnesDatesArentOverwritten() {
        com.bladebook.core.domain.TempSchedule a = new com.bladebook.core.domain.TempSchedule("a",
                com.bladebook.core.domain.TempSchedule.Kind.TIME_OFF, "", LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 2), List.of(), java.util.Map.of());
        com.bladebook.core.domain.TempSchedule b = new com.bladebook.core.domain.TempSchedule("b",
                com.bladebook.core.domain.TempSchedule.Kind.TIME_OFF, "", LocalDate.of(2026, 12, 2), LocalDate.of(2026, 12, 3), List.of(), java.util.Map.of());
        repo.saveTemp(ctx, a, null);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> repo.saveTemp(ctx, b, null))
                .isInstanceOf(com.bladebook.core.domain.DomainException.class);
        assertThat(repo.temps(ctx)).containsExactly(a);
    }
}
