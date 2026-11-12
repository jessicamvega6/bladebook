package com.bladebook.api.coach.config;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.StudentLinkService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * <b>Local profile only; listed shortcuts (SC-5, SC-8).</b> On AWS a schedule write reaches
 * {@code consumer-schedule-change}, and a {@code STUDENT#} change reaches {@code consumer-student-link}, through
 * DynamoDB Streams and EventBridge (ADR-MASTER sections 9 and 5). Neither runs locally, so this calls the
 * same core services in-process straight after the write (implementation plan, Question 4).
 */
@Component
@Profile("local")
public class LocalEventDispatcher {

    private static final Logger LOG = LoggerFactory.getLogger(LocalEventDispatcher.class);

    private final ScheduleChangeService scheduleChange;
    private final StudentLinkService studentLink;

    public LocalEventDispatcher(ScheduleChangeService scheduleChange, StudentLinkService studentLink) {
        this.scheduleChange = scheduleChange;
        this.studentLink = studentLink;
    }

    /** {@code ScheduleChanged}, from the weekly schedule ({@code DEFAULT}) or a dated one ({@code DATE_OVERRIDE}). */
    public ScheduleChangeService.Result scheduleChanged(AccessContext ctx, ChangeBatch.Source source) {
        ScheduleChangeService.Result r = scheduleChange.apply(ctx, source);
        LOG.info("ScheduleChanged (local): {} added, {} removed, {} updated, {} skipped; {} cancelled, {} re-priced, {} families",
                r.added(), r.removed(), r.replaced(), r.skipped(), r.cancelled(), r.repriced(), r.families());
        return r;
    }

    /** {@code StudentChanged}, status now {@code ACTIVE}. No approval email: Phase 2 (A10). */
    public void studentApproved(StudentRecord after) {
        studentLink.approved(after);
        LOG.info("StudentChanged (local): approved; the family's link updated");
    }

    /**
     * {@code StudentChanged}, record removed. On AWS the consumer also emails the family that the coach has
     * no room for new students; that email isn't built yet (SC-9), so it's only logged here, without the
     * address.
     */
    public void studentDeclined(StudentRecord before) {
        studentLink.declined(before);
        LOG.info("StudentChanged (local): declined; the family's link removed; decline email not sent (SC-9)");
    }
}
