package com.bladebook.core.service;

import com.bladebook.core.data.ShareRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * consumer-invite's copies. What it copies, and that running it twice changes nothing, is in
 * {@link com.bladebook.core.data.ShareRepositoryTest}; the flows that need it are in {@link ShareServiceTest}.
 */
class InviteSyncServiceTest {

    @Test
    void aLessonWithNoSeatsIsLeftAlone() {
        FamilyTestSupport t = new FamilyTestSupport();
        InviteSyncService sync = new InviteSyncService(new ShareRepository(t.f.clients, t.f.table));
        assertThatCode(() -> sync.seatsChanged(UUID.randomUUID().toString(), LocalDate.of(2026, 11, 16), LocalTime.of(6, 0)))
                .doesNotThrowAnyException();
    }
}
