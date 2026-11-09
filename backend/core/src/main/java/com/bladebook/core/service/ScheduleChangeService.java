package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.LessonTimes;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.Weeks;
import com.bladebook.core.domain.WeeklySchedule;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * What {@code consumer-schedule-change} does after a schedule save (ADR-MASTER section 9), as far as
 * Batch 2 goes: makes the stored lesson times match the schedule from today to the end of the booking
 * window plus 12 months. It reads the schedule as it is now, not as the event carried it, so running it
 * twice has one effect.
 *
 * <p>Not yet: cancel and re-price lines for booked times, the change-batch header, and the emails
 * (Batch 6). Booked times are left alone and counted in {@link Result#bookedNotChanged()}. Locally a
 * dispatcher in api-coach calls this straight after the save (implementation plan, Question 4).
 */
public final class ScheduleChangeService {

    public record Result(int added, int removed, int replaced, int skipped, int bookedNotChanged) {
    }

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;
    private final Clock clock;

    public ScheduleChangeService(ScheduleRepository schedules, CoachRepository coaches, Clock clock) {
        this.schedules = schedules;
        this.coaches = coaches;
        this.clock = clock;
    }

    public Result apply(AccessContext ctx) {
        CoachProfile coach = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
        ZoneId zone = ZoneId.of(coach.coachTimezone());
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate until = Weeks.storeUntil(today);

        WeeklySchedule weekly = schedules.findDefault(ctx).orElse(null);
        List<LessonTime> desired = LessonTimes.make(weekly, schedules.overrides(ctx, today, until), today, until, zone,
                coach.currency().name(), coach.requiredNoticeHours(), now);
        ScheduleChange plan = ScheduleChange.plan(schedules.lessonTimes(ctx, today, until), desired, now);
        ScheduleRepository.Applied done = schedules.apply(ctx, plan);
        return new Result(done.added(), done.removed(), done.replaced(), done.skipped(), plan.bookedNotChanged());
    }
}
