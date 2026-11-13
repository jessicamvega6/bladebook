package com.bladebook.api.coach.config;

import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.LocalStreamRouter;
import com.bladebook.core.service.ScheduledJobs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * <b>Local profile only; a listed shortcut (SC-22).</b> The local stand-in for EventBridge Scheduler (ADR-MASTER section
 * 14): {@code sched-day-reminder} at 7:00 AM, {@code sched-unpaid-reminder} on Monday at 8:00 AM, and
 * {@code sched-lesson-roller} at 2:30 AM, each in the launch time zone and given that day's date, as the Scheduler's
 * trigger carries it. {@code POST /api/coach/local/jobs/*} runs one by hand for any date.
 */
@Component
@Profile("local")
@EnableScheduling
public class LocalJobs {

    /** The launch time zone the Scheduler's rules use (ADR-MASTER section 12: "Monday morning in the launch timezone"). */
    static final ZoneId LAUNCH = ZoneId.of("America/Chicago");
    private static final Logger LOG = LoggerFactory.getLogger(LocalJobs.class);

    private final ScheduledJobs jobs;
    private final LocalStreamRouter router;
    private final TenantClients clients;
    private final Clock clock;

    public LocalJobs(ScheduledJobs jobs, LocalStreamRouter router, TenantClients clients, Clock clock) {
        this.jobs = jobs;
        this.router = router;
        this.clients = clients;
        this.clock = clock;
    }

    public LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), LAUNCH);
    }

    @Scheduled(cron = "0 0 7 * * *", zone = "America/Chicago")
    public void morning() {
        dayOf(today());
    }

    @Scheduled(cron = "0 0 8 * * MON", zone = "America/Chicago")
    public void monday() {
        unpaid(today());
    }

    @Scheduled(cron = "0 30 2 * * *", zone = "America/Chicago")
    public void nightly() {
        roll(today());
    }

    public ScheduledJobs.DayOf dayOf(LocalDate date) {
        ScheduledJobs.DayOf r = jobs.dayOf(date);
        router.drain(clients.localStream());
        LOG.info("sched-day-reminder (local) for {}: {}", date, r);
        return r;
    }

    public ScheduledJobs.Unpaid unpaid(LocalDate date) {
        ScheduledJobs.Unpaid r = jobs.unpaid(date);
        router.drain(clients.localStream());
        LOG.info("sched-unpaid-reminder (local) for {}: {}", date, r);
        return r;
    }

    public ScheduledJobs.Rolled roll(LocalDate date) {
        ScheduledJobs.Rolled r = jobs.roll(date);
        router.drain(clients.localStream());
        LOG.info("sched-lesson-roller (local) for {}: {}", date, r);
        return r;
    }
}
