package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;

/**
 * The notice period (ADR-MASTER section 10; B6, owner 2026-11-08). A family's cancellation is late when it is
 * made strictly less than the lesson's {@code requiredNoticeHours} before the start; exactly that many hours
 * before is in time. The hours come from the lesson time's own stamp, never the coach's current profile.
 * A lesson that has started can't be cancelled at all, so it is never "late".
 */
public final class Notice {

    private Notice() {
    }

    public static boolean isLate(Instant startsAtUtc, int requiredNoticeHours, Instant now) {
        return startsAtUtc.isAfter(now)
                && Duration.between(now, startsAtUtc).compareTo(Duration.ofHours(requiredNoticeHours)) < 0;
    }

    /** {@code noticeHours} on a cancellation line: whole hours from now to the start, rounded down; 0 once started. */
    public static long hoursBefore(Instant startsAtUtc, Instant now) {
        return startsAtUtc.isAfter(now) ? Duration.between(now, startsAtUtc).toHours() : 0;
    }
}
