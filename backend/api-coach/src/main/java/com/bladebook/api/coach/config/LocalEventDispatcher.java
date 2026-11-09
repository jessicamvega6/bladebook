package com.bladebook.api.coach.config;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.service.ScheduleChangeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * <b>Local profile only; a listed shortcut (SC-5).</b> On AWS a schedule write reaches
 * {@code consumer-schedule-change} through DynamoDB Streams and EventBridge (ADR-MASTER section 9).
 * Neither runs locally, so this calls the same core service in-process straight after the write
 * (implementation plan, Question 4).
 */
@Component
@Profile("local")
public class LocalEventDispatcher {

    private static final Logger LOG = LoggerFactory.getLogger(LocalEventDispatcher.class);

    private final ScheduleChangeService scheduleChange;

    public LocalEventDispatcher(ScheduleChangeService scheduleChange) {
        this.scheduleChange = scheduleChange;
    }

    /** {@code ScheduleChanged}. */
    public void scheduleChanged(AccessContext ctx) {
        ScheduleChangeService.Result r = scheduleChange.apply(ctx);
        LOG.info("ScheduleChanged (local): {} added, {} removed, {} updated, {} skipped, {} booked left alone",
                r.added(), r.removed(), r.replaced(), r.skipped(), r.bookedNotChanged());
    }
}
