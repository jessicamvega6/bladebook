package com.bladebook.api.coach.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** ADR-019 (I1): only requests carrying CloudFront's secret header reach the API. */
class OriginCheckTest {

    private final AtomicReference<String> stored = new AtomicReference<>("s3cret");
    private final AtomicInteger reads = new AtomicInteger();
    private final MutableClock clock = new MutableClock();
    private final OriginCheck.Secret secret = new OriginCheck.Secret(() -> {
        reads.incrementAndGet();
        return stored.get();
    }, clock);

    @Test
    void aRequestWithTheSecretGoesThroughAndOneWithoutIsRefused() throws Exception {
        assertThat(status("s3cret")).isEqualTo(200);
        assertThat(status(null)).isEqualTo(403);
        assertThat(status("guess")).isEqualTo(403);
        assertThat(status("")).isEqualTo(403);
    }

    @Test
    void theSecretIsReadOnceAndAgainAtMostOnceAMinuteOnAMismatch() {
        assertThat(secret.matches("s3cret")).isTrue();
        assertThat(secret.matches("s3cret")).isTrue();
        assertThat(secret.matches("guess")).isFalse();
        assertThat(secret.matches("guess")).isFalse();
        assertThat(reads).hasValue(1);

        stored.set("rotated");
        assertThat(secret.matches("rotated")).isFalse(); // within the minute: not read again
        clock.now = clock.now.plus(OriginCheck.REREAD_AFTER);
        assertThat(secret.matches("rotated")).isTrue();
        assertThat(reads).hasValue(2);
    }

    private int status(String header) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/x");
        if (header != null) {
            req.addHeader(OriginCheck.HEADER, header);
        }
        MockHttpServletResponse res = new MockHttpServletResponse();
        OriginCheck.filter(secret).doFilter(req, res, new MockFilterChain());
        return res.getStatus();
    }

    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-17T12:00:00Z");

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
