package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The local outbox (SC-21): newest first, and only the last 500 kept. */
class LocalOutboxTest {

    private final LocalOutbox outbox = new LocalOutbox(Clock.fixed(Instant.parse("2026-11-16T12:00:00Z"), ZoneOffset.UTC));

    private static Email email(String template) {
        return new Email(template, "a@example.com", "BladeBook", null, Map.of());
    }

    @Test
    void newestFirst() {
        outbox.send(email("one"));
        outbox.send(email("two"));
        assertThat(outbox.list()).extracting(s -> s.email().template()).containsExactly("two", "one");
        assertThat(outbox.list().get(0).at()).isEqualTo(Instant.parse("2026-11-16T12:00:00Z"));
    }

    @Test
    void keepsTheLast500() {
        for (int i = 0; i < LocalOutbox.KEEP + 3; i++) {
            outbox.send(email("e" + i));
        }
        assertThat(outbox.list()).hasSize(LocalOutbox.KEEP);
        assertThat(outbox.list().get(0).email().template()).isEqualTo("e" + (LocalOutbox.KEEP + 2));
    }

    @Test
    void clearEmptiesIt() {
        outbox.send(email("one"));
        outbox.clear();
        assertThat(outbox.list()).isEmpty();
    }
}
