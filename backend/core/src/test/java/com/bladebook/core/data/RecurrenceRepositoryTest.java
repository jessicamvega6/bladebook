package com.bladebook.core.data;

import com.bladebook.core.domain.Recurrence;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RecurrenceRepositoryTest {

    @Test
    void aHeaderIsWrittenOnceAndAChangeIsSaved() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        RecurrenceRepository repo = new RecurrenceRepository(f.clients, f.table);
        ClientContext park = new ClientContext(UUID.randomUUID().toString());
        Recurrence r = new Recurrence("coach", "r1", "ava", park.clientId(), DayOfWeek.MONDAY, LocalTime.of(6, 0), 1,
                LocalDate.of(2026, 12, 14), LocalDate.of(2026, 11, 16), Recurrence.Status.ACTIVE);
        assertThat(repo.putIfMissing(park, r)).isTrue();
        assertThat(repo.putIfMissing(park, r.after(Recurrence.Change.STOP, null, null))).isFalse();
        assertThat(repo.list(park)).containsExactly(r);
        repo.save(park, r.after(Recurrence.Change.LESS_OFTEN, null, 2));
        assertThat(repo.list(park).get(0).intervalWeeks()).isEqualTo(2);
        assertThat(repo.list(new ClientContext(UUID.randomUUID().toString()))).isEmpty();
    }
}
