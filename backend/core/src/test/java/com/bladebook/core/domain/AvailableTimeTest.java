package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** A lesson time as a family may see it: free or taken, and nothing about who (ADR-031 decision 1). */
class AvailableTimeTest {

    private static AvailableTime at(boolean free, int price, int shareCount, List<String> order) {
        return new AvailableTime(LocalDate.of(2026, 11, 16), LocalTime.of(6, 0), Instant.parse("2026-11-16T12:00:00Z"),
                "America/Chicago", 30, price, "USD", free, shareCount, order, 1, 24);
    }

    @Test
    void theKeyMatchesTheLessonTimes() {
        assertThat(at(true, 5000, 0, List.of()).key()).isEqualTo("LESSON#2026-11-16#06:00");
    }

    @Test
    void aFreeTimeCanBePickedUntilItStarts() {
        AvailableTime t = at(true, 5000, 0, List.of());
        assertThat(t.canPick(Instant.parse("2026-11-16T11:59:59Z"))).isTrue();
        assertThat(t.canPick(Instant.parse("2026-11-16T12:00:00Z"))).isFalse();
        assertThat(at(false, 5000, 1, List.of("x")).canPick(Instant.parse("2026-11-10T00:00:00Z"))).isFalse();
    }

    @Test
    void theEndIsTheStartPlusTheLength() {
        assertThat(at(true, 5000, 0, List.of()).endTime()).isEqualTo(LocalTime.of(6, 30));
    }

    @Test
    void theShareForAPrivateBookingIsTheWholePrice() {
        assertThat(at(true, 4501, 0, List.of()).shareFor("ava")).isEqualTo(4501);
        assertThat(at(false, 4501, 2, List.of("ava", "mia")).shareFor("mia")).isEqualTo(2250);
    }
}
