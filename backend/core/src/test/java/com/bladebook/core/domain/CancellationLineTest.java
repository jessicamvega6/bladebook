package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class CancellationLineTest {

    private static final Instant NOW = Instant.parse("2026-11-15T14:30:00Z");
    private static final Seat SEAT = new Seat("coach-1", LocalDate.of(2026, 11, 16), LocalTime.of(6, 0), "ava-1", "park-1",
            "Ava P.", Seat.Status.BOOKED, Instant.parse("2026-11-16T12:00:00Z"), "America/Chicago", 30,
            Instant.parse("2026-11-10T15:00:00Z"), "key-12345678");
    private static final ChangeBatch BATCH = new ChangeBatch("b-1", NOW, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT,
            "park-1", SEAT.lessonDate(), SEAT.lessonDate(), 1, 1, ChangeBatch.Execution.EXECUTED);

    @Test
    void theLineCopiesTheSeatAndRecordsWhenAndWithHowMuchNotice() {
        CancellationLine l = CancellationLine.of(BATCH, SEAT, 5000, "USD", NOW);
        assertThat(l.key()).isEqualTo("CANCELLED#2026-11-15T14:30:00.000Z#b-1#SEAT#2026-11-16#06:00#ava-1");
        assertThat(l.lessonDate()).isEqualTo(LocalDate.of(2026, 11, 16));
        assertThat(l.startTime()).isEqualTo(LocalTime.of(6, 0));
        assertThat(l.durationMinutes()).isEqualTo(30);
        assertThat(l.priceMinor()).isEqualTo(5000);
        assertThat(l.currency()).isEqualTo("USD");
        assertThat(l.studentId()).isEqualTo("ava-1");
        assertThat(l.studentName()).isEqualTo("Ava P.");
        assertThat(l.clientId()).isEqualTo("park-1");
        assertThat(l.cancelledBy()).isEqualTo(ChangeBatch.By.CLIENT);
        assertThat(l.cancelledAt()).isEqualTo(NOW);
        assertThat(l.noticeHours()).isEqualTo(21);
        assertThat(l.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
    }

    @Test
    void theLineSortsUnderItsBatch() {
        CancellationLine l = CancellationLine.of(BATCH, SEAT, 5000, "USD", NOW);
        assertThat(l.key()).contains(BATCH.stamp() + "#" + BATCH.batchId());
    }

    @Test
    void withStatusChangesOnlyTheStatus() {
        CancellationLine l = CancellationLine.of(BATCH, SEAT, 5000, "USD", NOW);
        CancellationLine p = l.withStatus(ChangeBatch.Execution.PLANNED);
        assertThat(p.executionStatus()).isEqualTo(ChangeBatch.Execution.PLANNED);
        assertThat(p.withStatus(ChangeBatch.Execution.EXECUTED)).isEqualTo(l);
    }
}
