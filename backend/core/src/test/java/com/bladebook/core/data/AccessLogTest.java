package com.bladebook.core.data;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AccessLogTest {

    private static final AccessContext COACH = new AccessContext("coach-1");
    private static final ClientContext FAMILY = new ClientContext("family-1");
    private static final Instant NOW = Instant.parse("2026-11-17T12:00:00Z");

    private final List<List<AccessLog.Line>> writes = new ArrayList<>();

    private void install(AccessLog.Sink sink) {
        AccessLog.install(sink, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @AfterEach
    void reset() {
        AccessLog.end();
        AccessLog.install(AccessLog.APPLICATION_LOG, Clock.systemUTC());
    }

    @Test
    void aRequestsLinesAreWrittenTogetherOnceBeforeTheResponse() {
        install(writes::add);
        AccessLog.begin("req-1", "203.0.113.7");
        AccessLog.coachRead(COACH, "students", new AccessLog.Ids().add("studentId", "s2").add("studentId", "s1"), List.of("studentName"));
        AccessLog.coachRead(COACH, "calendar", new AccessLog.Ids().add("studentId", "s1"), List.of("fullName"));
        assertThat(writes).isEmpty();

        AccessLog.flush();
        AccessLog.flush();
        AccessLog.end();

        assertThat(writes).hasSize(1);
        AccessLog.Line l = writes.get(0).get(0);
        assertThat(l.requestId()).isEqualTo("req-1");
        assertThat(l.source()).isEqualTo("203.0.113.7");
        assertThat(l.role()).isEqualTo("coach");
        assertThat(l.actor()).isEqualTo("coach-1");
        assertThat(l.ids()).isEqualTo(Map.of("studentId", Set.of("s1", "s2")));
        assertThat(l.json()).isEqualTo("{\"time\":\"2026-11-17T12:00:00Z\",\"requestId\":\"req-1\",\"source\":\"203.0.113.7\","
                + "\"role\":\"coach\",\"actor\":\"coach-1\",\"operation\":\"students\",\"ids\":{\"studentId\":[\"s1\",\"s2\"]},"
                + "\"fields\":[\"studentName\"]}");
    }

    @Test
    void aFailedWriteFailsTheRequestAndIsntTriedAgainByTheErrorAnswer() {
        install(lines -> {
            throw new IllegalStateException("CloudWatch is down");
        });
        AccessLog.begin("req-1", "203.0.113.7");
        AccessLog.coachRead(COACH, "students", new AccessLog.Ids().add("studentId", "s1"), List.of("studentName"));
        assertThatThrownBy(AccessLog::flush).hasMessage("CloudWatch is down");
        AccessLog.flush(); // the error answer's body: nothing left
        AccessLog.end();
    }

    @Test
    void outsideARequestALineIsWrittenAtOnce() {
        install(writes::add);
        AccessLog.familyRead(FAMILY, "PARENT", "share-check", new AccessLog.Ids().add("coachId", "c1"), List.of("displayName"));
        assertThat(writes).hasSize(1);
        assertThat(writes.get(0).get(0).relationship()).isEqualTo("PARENT");
        assertThat(writes.get(0).get(0).requestId()).isNull();
        assertThat(writes.get(0).get(0).json()).doesNotContain("requestId").contains("\"relationship\":\"PARENT\"");
    }

    @Test
    void aReadReturningNoPersonalFieldsWritesNothingButASecurityEventAlwaysDoes() {
        install(writes::add);
        AccessLog.coachRead(COACH, "students", new AccessLog.Ids(), List.of());
        assertThat(writes).isEmpty();
        AccessLog.security("family", "family-1", "never-linked-book", new AccessLog.Ids().add("coachId", "c1"));
        assertThat(writes).singleElement().satisfies(w -> assertThat(w.get(0).operation()).isEqualTo("security:never-linked-book"));
    }

    @Test
    void aRequestsLinesStayWithItsThread() throws Exception {
        install(writes::add);
        AccessLog.begin("req-1", null);
        Thread other = new Thread(() -> AccessLog.coachRead(COACH, "other", new AccessLog.Ids(), List.of("name")));
        other.start();
        other.join();
        assertThat(writes).singleElement().satisfies(w -> assertThat(w.get(0).requestId()).isNull());
    }
}
