package com.bladebook.core.events;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AccessLog;
import com.bladebook.core.data.AccessLogCapture;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.Email;
import com.bladebook.core.service.LocalOutbox;
import com.bladebook.core.service.NotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The event consumers' routing (ADR-MASTER sections 2 and 3). Each service's own flows are tested with the service; here,
 * that each event reaches it from a stream record, that a record the event doesn't act on is ignored, and the access-log
 * line each event writes (I21).
 */
class EventConsumersTest {

    private static final Instant NOW = Instant.parse("2026-11-18T12:00:00Z");

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    private final LocalOutbox outbox = new LocalOutbox(Clock.fixed(NOW, ZoneOffset.UTC));
    private final EventConsumers consumers = new EventConsumers("bladebook-dev-consumer-student-link", f.clients, f.table, outbox,
            new NotificationService.Links("https://app.bladebook.test", "https://family.bladebook.test"), Clock.fixed(NOW, ZoneOffset.UTC));
    private final AccessLogCapture log = AccessLogCapture.start();

    @AfterEach
    void tearDown() {
        log.close();
    }

    private String coach() {
        AccessContext ctx = new AccessContext(UUID.randomUUID().toString());
        new CoachRepository(f.clients, f.table).create(ctx, CoachProfile.builder().coachId(ctx.coachId()).firstName("Dana")
                .lastName("Whitfield").loginEmail("dana@gmail.com").businessEmail("dana@gmail.com").phone("(205) 555-0142")
                .coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD).coachCode(CoachCode.parse("7K2Q-M9XT")).build());
        return ctx.coachId();
    }

    private static String student(String coachId, String status) {
        return """
                {"PK":{"S":"COACH#%s"},"SK":{"S":"STUDENT#s1"},"studentId":{"S":"s1"},"clientId":{"S":"f1"},
                 "studentStatus":{"S":"%s"},"studentName":{"S":"Sam Lee"},"isMinor":{"BOOL":true},
                 "clientRelationship":{"S":"GUARDIAN"},"clientName":{"S":"Kim Lee"},"clientEmail":{"S":"lee@example.com"},
                 "clientPhone":{"S":"(205) 555-0122"},"skatingOrg":{"S":"USFS"},"registrationNumber":{"S":"1234567"},
                 "signedUpAt":{"S":"2026-11-09T15:00:00Z"}}""".formatted(coachId, status);
    }

    private static String record(String eventName, String pk, String sk, String newImage, String oldImage) {
        return """
                {"detail":{"eventName":"%s","dynamodb":{"Keys":{"PK":{"S":"%s"},"SK":{"S":"%s"}}%s%s}}}"""
                .formatted(eventName, pk, sk, newImage == null ? "" : ",\"NewImage\":" + newImage,
                        oldImage == null ? "" : ",\"OldImage\":" + oldImage);
    }

    @Test
    void aDeclinedSignUpIsEmailedAndLoggedAsOneLineForTheEvent() {
        String coachId = coach();
        EventConsumers.Outcome o = consumers.run(EventConsumers.Event.StudentChanged,
                record("REMOVE", "COACH#" + coachId, "STUDENT#s1", null, student(coachId, "PENDING")), "req-1");

        assertThat(o.count()).isEqualTo(1);
        Email e = outbox.list().get(0).email();
        assertThat(e.template()).isEqualTo("signup-declined");
        assertThat(e.to()).isEqualTo("lee@example.com");

        AccessLog.Line line = log.only("StudentChanged");
        assertThat(line.role()).isEqualTo("consumer");
        assertThat(line.actor()).isEqualTo("bladebook-dev-consumer-student-link");
        assertThat(line.requestId()).isEqualTo("req-1");
        assertThat(line.ids()).isEqualTo(Map.of("coachId", java.util.Set.of(coachId), "studentId", java.util.Set.of("s1"),
                "clientId", java.util.Set.of("f1")));
        assertThat(line.fields()).containsExactly("clientEmail", "clientName", "studentName");
        assertThat(line.json()).doesNotContain("lee@example.com", "Sam Lee");
    }

    @Test
    void aRecordTheEventDoesntActOnIsIgnoredAndWritesNoLine() {
        String coachId = coach();
        assertThat(consumers.run(EventConsumers.Event.StudentChanged, record("MODIFY", "COACH#" + coachId, "STUDENT#s1",
                student(coachId, "ACTIVE"), student(coachId, "ACTIVE")), "req-2").count()).isEqualTo(-1); // a name change
        assertThat(consumers.run(EventConsumers.Event.LessonBooked, record("MODIFY", "CLIENT#f1", "PROFILE", "{}", null), "r")
                .count()).isEqualTo(-1);
        assertThat(consumers.run(EventConsumers.Event.ScheduleChanged, record("INSERT", "COACH#" + coachId, "SCHEDULE#TEMP#t1", "{}",
                null), "r").count()).isEqualTo(-1);
        assertThat(consumers.run(EventConsumers.Event.FamilyChanged, record("REMOVE", "CLIENT#f1", "PROFILE", null, "{}"), "r")
                .count()).isEqualTo(-1);
        assertThat(consumers.run(EventConsumers.Event.SharedLessonChanged, record("MODIFY", "COACH#" + coachId, "PROFILE", "{}", null),
                "r").count()).isEqualTo(-1);
        assertThat(consumers.run(EventConsumers.Event.LessonsChanged, record("MODIFY", "COACH#" + coachId, "PROFILE", "{}", null),
                "r").count()).isEqualTo(-1);
        assertThat(outbox.list()).isEmpty();
        assertThat(log.lines).isEmpty();
    }

    @Test
    void eachEventReachesItsServiceAndAMissingItemSendsNothing() {
        String coachId = coach();
        String pk = "COACH#" + coachId;
        assertThat(consumers.run(EventConsumers.Event.LessonBooked, record("MODIFY", pk, "SEAT#2026-11-23#06:00#s1", "{}", null), "a")
                .count()).isZero();
        assertThat(consumers.run(EventConsumers.Event.CheckInRecorded, record("MODIFY", pk, "SEAT#2026-11-23#06:00#s1", "{}", null), "b")
                .count()).isZero();
        assertThat(consumers.run(EventConsumers.Event.LessonsChanged, record("MODIFY", pk, "CHANGEBATCH#2026-11-18T12:00:00.000Z#b1",
                "{}", null), "c").count()).isZero();
        assertThat(consumers.run(EventConsumers.Event.SharedLessonChanged, record("MODIFY", pk, "LESSON#2026-11-23#06:00", "{}", null),
                "d").count()).isZero();
        assertThat(consumers.run(EventConsumers.Event.ScheduleChanged, record("INSERT", pk, "SCHEDULE#DEFAULT", "{}", null), "e")
                .count()).isZero();
        assertThat(consumers.run(EventConsumers.Event.ScheduleChanged, record("REMOVE", pk, "SCHEDULE#DATE#2026-11-23", null, "{}"), "f")
                .count()).isZero();
        assertThat(consumers.run(EventConsumers.Event.FamilyChanged, record("INSERT", "CLIENT#f1", "PROFILE", "{\"clientName\":{\"S\":\"Kim\"}}", null), "g")
                .count()).isZero();
        assertThat(outbox.list()).isEmpty();
        assertThat(log.lines).extracting(AccessLog.Line::operation).containsExactly("LessonBooked", "CheckInRecorded",
                "LessonsChanged", "SharedLessonChanged", "ScheduleChanged", "ScheduleChanged", "FamilyChanged");
        assertThat(log.lines.get(6).ids()).containsOnlyKeys("clientId");
    }

    @Test
    void anApprovalUpdatesTheFamilysLinkAndSendsNoEmail() {
        String coachId = coach();
        EventConsumers.Outcome o = consumers.run(EventConsumers.Event.StudentChanged, record("MODIFY", "COACH#" + coachId, "STUDENT#s1",
                student(coachId, "ACTIVE"), student(coachId, "PENDING")), "req-3");
        assertThat(o.count()).isEqualTo(1);
        assertThat(outbox.list()).isEmpty();
        assertThat(log.only("StudentChanged").actor()).isEqualTo("bladebook-dev-consumer-student-link");
    }

    @Test
    void everyEventNamesTheFieldsItReads() {
        for (EventConsumers.Event e : EventConsumers.Event.values()) {
            assertThat(EventConsumers.FIELDS.get(e)).as(e.name()).isNotEmpty();
        }
    }

    @Test
    void onLambdaTheFunctionsNameAndTheTableMustBeSet() {
        assertThatThrownBy(() -> EventConsumers.fromEnvironment(Map.<String, String>of()::get))
                .hasMessageContaining("AWS_LAMBDA_FUNCTION_NAME");
    }

    @Test
    void consumerScheduleChangeTakesAReconcileRequestAndOnlyItDoes() {
        String coachId = coach();
        EventConsumers.Outcome o = consumers.run(EventConsumers.Event.ScheduleChanged, "{\"reconcile\":\"" + coachId + "\"}", "req-r");
        assertThat(o.count()).isZero(); // nothing stuck and nothing different
        assertThat(log.only("reconcile").ids()).isEqualTo(Map.of("coachId", java.util.Set.of(coachId)));
        assertThatThrownBy(() -> consumers.run(EventConsumers.Event.LessonBooked, "{\"reconcile\":\"" + coachId + "\"}", "x"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(EventConsumers.reconcileRequest("{\"detail\":{}}")).isNull();
    }
}
