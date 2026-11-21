package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class RepriceLineTest {

    private static final Seat SEAT = new Seat("coach-1", LocalDate.of(2026, 11, 16), LocalTime.of(6, 0), "ava-1", "park-1",
            "Ava P.", Seat.Status.BOOKED, Instant.parse("2026-11-16T12:00:00Z"), "America/Chicago", 30,
            Instant.parse("2026-11-10T15:00:00Z"), "key-12345678");
    private static final ChangeBatch BATCH = new ChangeBatch("b-1", Instant.parse("2026-11-12T15:00:00Z"), ChangeBatch.Source.DEFAULT,
            ChangeBatch.By.SCHEDULE_CHANGE, "coach-1", null, null, 0, 0, ChangeBatch.Execution.PLANNED);

    @Test
    void aPlannedLineCopiesTheSeatAndBothPrices() {
        RepriceLine l = RepriceLine.planned(BATCH, SEAT, 5000, 6000, "USD");
        assertThat(l.key()).isEqualTo("REPRICED#2026-11-12T15:00:00.000Z#b-1#SEAT#2026-11-16#06:00#ava-1");
        assertThat(l.executionStatus()).isEqualTo(ChangeBatch.Execution.PLANNED);
        assertThat(l.direction()).isEqualTo("UP");
        assertThat(l.studentName()).isEqualTo("Ava P.");
        assertThat(RepriceLine.planned(BATCH, SEAT, 5000, 4000, "USD").direction()).isEqualTo("DOWN");
    }
}
