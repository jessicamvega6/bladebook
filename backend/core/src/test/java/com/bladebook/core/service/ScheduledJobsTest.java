package com.bladebook.core.service;

import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.CoachRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The scheduled jobs on an empty table. Their flows (reminders, the morning email, the Monday list repeating until paid, the
 * roller adding only what's missing) are in {@link NotificationServiceTest}.
 */
class ScheduledJobsTest {

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-16T13:00:00Z"), ZoneOffset.UTC);
    private final LocalOutbox outbox = new LocalOutbox(clock);
    private final NotifyRepository repo = new NotifyRepository(f.clients, f.table);
    private final NotificationService notifications = new NotificationService(repo, outbox, new NotificationService.Links("https://b.test"), clock);
    private final ScheduleChangeService schedules = new ScheduleChangeService(new ScheduleRepository(f.clients, f.table),
            new CoachRepository(f.clients, f.table), clock);

    @Test
    void aQuietDaySendsNothing() {
        ScheduledJobs jobs = new ScheduledJobs(repo, notifications, schedules, outbox, 7);
        assertThat(jobs.dayOf(LocalDate.of(2026, 11, 16))).isEqualTo(new ScheduledJobs.DayOf(0, 0));
        assertThat(jobs.unpaid(LocalDate.of(2026, 11, 16))).isEqualTo(new ScheduledJobs.Unpaid(0, 0));
        assertThat(jobs.roll(LocalDate.of(2026, 11, 16))).isEqualTo(new ScheduledJobs.Rolled(0, 0));
        assertThat(outbox.list()).isEmpty();
    }

    @Test
    void noThresholdSetMeansTheMondayEmailSendsNothing() {
        ScheduledJobs jobs = new ScheduledJobs(repo, notifications, schedules, outbox, null);
        assertThat(jobs.unpaid(LocalDate.of(2026, 11, 16))).isEqualTo(new ScheduledJobs.Unpaid(0, 0));
    }
}
