package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChangeBatchTest {

    private static ChangeBatch at(Instant t) {
        return new ChangeBatch("b-1", t, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, "client-1",
                LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 16), 1, 1, ChangeBatch.Execution.EXECUTED);
    }

    @Test
    void theKeyCarriesTheTimeToTheMillisecondAndTheBatchId() {
        assertThat(at(Instant.parse("2026-11-10T15:00:00Z")).key()).isEqualTo("CHANGEBATCH#2026-11-10T15:00:00.000Z#b-1");
        assertThat(at(Instant.parse("2026-11-10T15:00:00.123456Z")).key()).isEqualTo("CHANGEBATCH#2026-11-10T15:00:00.123Z#b-1");
    }

    @Test
    void stampsSortByTime() {
        String a = ChangeBatch.stamp(Instant.parse("2026-11-10T15:00:00Z"));
        String b = ChangeBatch.stamp(Instant.parse("2026-11-10T15:00:00.5Z"));
        assertThat(a.compareTo(b)).isNegative();
    }

    @Test
    void executedSetsTheCounts() {
        ChangeBatch planned = new ChangeBatch("b-2", Instant.parse("2026-11-10T15:00:00Z"), ChangeBatch.Source.DAY,
                ChangeBatch.By.COACH, "coach-1", LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 16), 3, 2,
                ChangeBatch.Execution.PLANNED);
        ChangeBatch done = planned.executed(2, 1);
        assertThat(done.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(done.lessonCount()).isEqualTo(2);
        assertThat(done.clientCount()).isEqualTo(1);
        assertThat(done.key()).isEqualTo(planned.key());
    }

    @Test
    void theStatusesAreTheMastersLists() {
        assertThat(ChangeBatch.Source.values()).extracting(Enum::name)
                .containsExactly("DEFAULT", "DATE_OVERRIDE", "LESSON", "DAY", "WEEK", "RECURRENCE", "RECONCILE");
        assertThat(ChangeBatch.By.values()).extracting(Enum::name).containsExactly("CLIENT", "COACH", "SCHEDULE_CHANGE", "NO_ANSWER");
        assertThat(ChangeBatch.Execution.values()).extracting(Enum::name).containsExactly("PLANNED", "EXECUTED", "SKIPPED");
    }

    @Test
    void theRequiredFieldsMustBeThere() {
        assertThatThrownBy(() -> new ChangeBatch(null, Instant.EPOCH, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, "x",
                null, null, 0, 0, ChangeBatch.Execution.PLANNED)).isInstanceOf(NullPointerException.class);
    }
}
