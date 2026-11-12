package com.bladebook.core.data;

import com.bladebook.core.domain.ChangeBatch;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The full flow, with lessons, is in ScheduleChangeBookedTest; this checks the header and the latest batch. */
class ChangeBatchRepositoryTest {

    private static ChangeBatch batch(ChangeBatch.Source source, Instant at) {
        return new ChangeBatch(UUID.randomUUID().toString(), at, source, ChangeBatch.By.SCHEDULE_CHANGE, "coach",
                LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 16), 1, 1, ChangeBatch.Execution.PLANNED);
    }

    @Test
    void theLatestScheduleChangeIsFoundAndACoachCancelIsnt() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        AccessContext ctx = new AccessContext(UUID.randomUUID().toString());
        ChangeBatchRepository repo = new ChangeBatchRepository(f.clients, f.table);
        assertThat(repo.latest(ctx)).isEmpty();

        ChangeBatch older = batch(ChangeBatch.Source.DEFAULT, Instant.parse("2026-11-10T15:00:00Z"));
        ChangeBatch newer = batch(ChangeBatch.Source.DATE_OVERRIDE, Instant.parse("2026-11-11T15:00:00Z"));
        repo.begin(ctx, older);
        repo.begin(ctx, newer);
        new CancellationRepository(f.clients, f.table).start(ctx, batch(ChangeBatch.Source.DAY, Instant.parse("2026-11-12T15:00:00Z")));

        assertThat(repo.latest(ctx)).hasValueSatisfying(l -> {
            assertThat(l.batch()).isEqualTo(newer);
            assertThat(l.planStatus()).isEqualTo("WRITING");
            assertThat(l.passed()).isEmpty();
        });
        repo.finish(ctx, newer.executed(1, 1));
        assertThat(repo.latest(ctx).orElseThrow().batch().executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
    }
}
