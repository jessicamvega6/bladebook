package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

/** One bookable time (ADR-031 decision 1). */
class LessonTimeTest {

    private static LessonTime at(int price, int maxSkaters, LessonTime.Status status, long version) {
        return new LessonTime(LocalDate.of(2026, 11, 9), LocalTime.of(6, 0), Instant.parse("2026-11-09T12:00:00Z"),
                "America/Chicago", 30, price, "USD", 0, 24, maxSkaters, 0, 1, IceType.PUBLIC, version, status);
    }

    @Test
    void theKeyIsTheLocalDateAndStartTime() {
        assertThat(at(5000, 1, LessonTime.Status.OPEN, 1).key()).isEqualTo("LESSON#2026-11-09#06:00");
    }

    @Test
    void sameStampsIgnoresStatusSeatsAndVersion() {
        assertThat(at(5000, 1, LessonTime.Status.OPEN, 1).sameStamps(at(5000, 1, LessonTime.Status.HELD, 9))).isTrue();
        assertThat(at(5000, 1, LessonTime.Status.OPEN, 1).sameStamps(at(5001, 1, LessonTime.Status.OPEN, 1))).isFalse();
        assertThat(at(5000, 1, LessonTime.Status.OPEN, 1).sameStamps(at(5000, 2, LessonTime.Status.OPEN, 1))).isFalse();
    }

    @Test
    void withPriceChangesOnlyThePrice() {
        LessonTime t = at(5000, 2, LessonTime.Status.OPEN, 3).withPrice(4000);
        assertThat(t.priceMinor()).isEqualTo(4000);
        assertThat(t.maxSkaters()).isEqualTo(2);
        assertThat(t.scheduleVersion()).isEqualTo(3);
    }
}
