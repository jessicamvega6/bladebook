package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** One skater's place in one lesson time (ADR-031 decision 2). */
class SeatTest {

    private static final AvailableTime SIX = new AvailableTime(LocalDate.of(2026, 11, 16), LocalTime.of(6, 0),
            Instant.parse("2026-11-16T12:00:00Z"), "America/Chicago", 30, 5000, "USD", true, 0, List.of(), 1, 24);

    @Test
    void theKeyIsDateStartAndSkater() {
        assertThat(Seat.key(LocalDate.of(2026, 11, 16), LocalTime.of(6, 0), "ava-1")).isEqualTo("SEAT#2026-11-16#06:00#ava-1");
    }

    @Test
    void aBookedSeatCopiesTheTimesStartZoneAndLengthAndCarriesTheDisplayName() {
        Instant now = Instant.parse("2026-11-10T15:00:00Z");
        Seat s = Seat.booked("coach-1", SIX, "ava-1", "family-1", "Ava Park", now, "key-12345");

        assertThat(s.key()).isEqualTo("SEAT#2026-11-16#06:00#ava-1");
        assertThat(s.seatStatus()).isEqualTo(Seat.Status.BOOKED);
        assertThat(s.studentName()).isEqualTo("Ava P.");
        assertThat(s.startsAtUtc()).isEqualTo(SIX.startsAtUtc());
        assertThat(s.coachTz()).isEqualTo("America/Chicago");
        assertThat(s.durationMinutes()).isEqualTo(30);
        assertThat(s.joinedAt()).isEqualTo(now);
        assertThat(s.idempotencyKey()).isEqualTo("key-12345");
        assertThat(s.clientId()).isEqualTo("family-1");
        assertThat(s.coachId()).isEqualTo("coach-1");
    }

    @Test
    void aSeatHasStartedOnceItsStartIsReached() {
        Seat s = Seat.booked("coach-1", SIX, "ava-1", "family-1", "Ava Park", Instant.parse("2026-11-10T15:00:00Z"), "key-12345");
        assertThat(s.hasStarted(Instant.parse("2026-11-16T11:59:59Z"))).isFalse();
        assertThat(s.hasStarted(Instant.parse("2026-11-16T12:00:00Z"))).isTrue();
    }
}
