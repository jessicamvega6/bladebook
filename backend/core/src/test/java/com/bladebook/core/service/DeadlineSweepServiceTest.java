package com.bladebook.core.service;

import com.bladebook.core.data.ShareRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * sched-deadline-sweep on a table with nothing due. The flows it acts on (an invitation expiring at the lesson's start,
 * a staying family that never answered) are in {@link ShareServiceTest}.
 */
class DeadlineSweepServiceTest {

    @Test
    void nothingDueDoesNothing() {
        FamilyTestSupport t = new FamilyTestSupport();
        DeadlineSweepService sweep = new DeadlineSweepService(new ShareRepository(t.f.clients, t.f.table), SeatEvents.NONE);
        assertThat(sweep.sweep(Instant.parse("2026-11-16T12:00:00Z"))).isEqualTo(new DeadlineSweepService.Swept(0, 0, 0));
    }
}
