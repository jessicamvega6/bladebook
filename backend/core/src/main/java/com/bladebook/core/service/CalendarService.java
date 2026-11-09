package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The coach's month, week and day views (ADR-MASTER section 6, Calendars): one range of dates with each
 * date's lesson times and whether an override applies. Dates and "now" are the coach's, in the coach's
 * time zone, so the website never uses the browser's.
 */
public final class CalendarService {

    /** A month grid is six weeks at most. */
    static final int MAX_DAYS = 42;

    public record CalendarDay(LocalDate date, boolean override, List<LessonTime> lessons) {

        public CalendarDay {
            lessons = List.copyOf(lessons);
        }
    }

    public record CalendarView(String coachTimezone, LocalDate today, LocalTime now, boolean hasSchedule, List<CalendarDay> days) {

        public CalendarView {
            days = List.copyOf(days);
        }
    }

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;
    private final Clock clock;

    public CalendarService(ScheduleRepository schedules, CoachRepository coaches, Clock clock) {
        this.schedules = schedules;
        this.coaches = coaches;
        this.clock = clock;
    }

    /** {@code from} to {@code to} inclusive, at most 42 days. */
    public CalendarView range(AccessContext ctx, LocalDate from, LocalDate to) {
        if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            throw DomainException.invalid("to", "Pick up to six weeks at a time.");
        }
        CoachProfile coach = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
        ZonedDateTime now = ZonedDateTime.now(clock.withZone(ZoneId.of(coach.coachTimezone())));

        List<LessonTime> lessons = schedules.lessonTimes(ctx, from, to);
        Map<LocalDate, List<ScheduleBlock>> overrides = schedules.overrides(ctx, from, to);
        boolean hasSchedule = schedules.findDefault(ctx).map(w -> !w.isEmpty()).orElse(false);

        List<CalendarDay> days = new ArrayList<>();
        int i = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            List<LessonTime> on = new ArrayList<>();
            while (i < lessons.size() && lessons.get(i).lessonDate().equals(d)) {
                on.add(lessons.get(i++));
            }
            days.add(new CalendarDay(d, overrides.containsKey(d), on));
        }
        return new CalendarView(coach.coachTimezone(), now.toLocalDate(), now.toLocalTime().truncatedTo(ChronoUnit.MINUTES),
                hasSchedule, days);
    }
}
