package com.bladebook.api.client.config;

import com.bladebook.core.data.ClientContext;
import com.bladebook.core.service.DeadlineSweepService;
import com.bladebook.core.service.FamilySyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.temporal.ChronoUnit;

/**
 * <b>Local profile only; a listed shortcut.</b> On AWS a family's profile change reaches
 * {@code consumer-family-sync} through DynamoDB Streams and EventBridge, and the Scheduler runs
 * {@code sched-deadline-sweep} every hour. Neither runs locally, so this calls the same core services in-process straight
 * after the write, and runs the sweep on a local timer (implementation plan, Question 4).
 */
@Component
@Profile("local")
public class LocalEventDispatcher {

    private static final Logger LOG = LoggerFactory.getLogger(LocalEventDispatcher.class);

    private final FamilySyncService familySync;
    private final DeadlineSweepService sweep;
    private final Clock clock;

    public LocalEventDispatcher(FamilySyncService familySync, DeadlineSweepService sweep, Clock clock) {
        this.familySync = familySync;
        this.sweep = sweep;
        this.clock = clock;
    }

    /** {@code FamilyChanged}: contact copies, and a share code for any skater without one (G-17). */
    public void familyChanged(ClientContext ctx) {
        LOG.info("FamilyChanged (local): {} coach records updated, {} share codes issued", familySync.familyChanged(ctx.clientId()),
                familySync.issueShareCodes(ctx.clientId()));
    }

    /** A skater was created (sign-up, Add a skater), or a skater from before Batch 11 has no code yet: issue share codes. */
    public void skatersChanged(ClientContext ctx) {
        int n = familySync.issueShareCodes(ctx.clientId());
        if (n > 0) {
            LOG.info("FamilyChanged (local): {} share codes issued", n);
        }
    }

    /** The hourly sweep, on the hour it's for. */
    @Scheduled(cron = "0 0 * * * *")
    public void hourlySweep() {
        sweepNow();
    }

    public DeadlineSweepService.Swept sweepNow() {
        DeadlineSweepService.Swept s = sweep.sweep(clock.instant().truncatedTo(ChronoUnit.SECONDS));
        LOG.info("sched-deadline-sweep (local): {}", s);
        return s;
    }
}
