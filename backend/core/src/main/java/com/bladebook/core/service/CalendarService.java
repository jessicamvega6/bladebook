package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.StudentRecord;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The coach's month, week and day views (ADR-MASTER section 6, Calendars): one range of dates with each
 * date's lesson times, who is booked in them, and whether an override applies. Dates and "now" are the
 * coach's, in the coach's time zone, so the website never uses the browser's.
 */
public final class CalendarService {

    /** A month grid is six weeks at most. */
    static final int MAX_DAYS = 42;

    /**
     * A skater booked in one of the day's times: the seat's display name for the week view ("Ava P."), and the
     * full name and family contact from the coach's own {@code STUDENT#} record for the day view. {@code familyId}
     * lets the cancel preview count the families it will email.
     */
    public record Booked(LocalTime startTime, String studentId, String shortName, String fullName, String familyName, String familyId) {
    }

    public record CalendarDay(LocalDate date, boolean override, List<LessonTime> lessons, List<Booked> booked) {

        public CalendarDay {
            lessons = List.copyOf(lessons);
            booked = List.copyOf(booked);
        }
    }

    public record CalendarView(String coachTimezone, LocalDate today, LocalTime now, boolean hasSchedule, List<CalendarDay> days) {

        public CalendarView {
            days = List.copyOf(days);
        }
    }

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;
    private final StudentRepository students;
    private final Clock clock;

    public CalendarService(ScheduleRepository schedules, CoachRepository coaches, StudentRepository students, Clock clock) {
        this.schedules = schedules;
        this.coaches = coaches;
        this.students = students;
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
        List<Seat> seats = schedules.seats(ctx, from, to);
        Map<String, StudentRecord> records = new HashMap<>();
        if (!seats.isEmpty()) {
            students.list(ctx).forEach(r -> records.put(r.studentId(), r));
        }

        List<CalendarDay> days = new ArrayList<>();
        int i = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            List<LessonTime> on = new ArrayList<>();
            while (i < lessons.size() && lessons.get(i).lessonDate().equals(d)) {
                on.add(lessons.get(i++));
            }
            List<Booked> booked = new ArrayList<>();
            for (Seat s : seats) {
                if (s.lessonDate().equals(d)) {
                    StudentRecord r = records.get(s.studentId());
                    booked.add(new Booked(s.startTime(), s.studentId(), s.studentName(),
                            r == null ? s.studentName() : r.studentName(), r == null ? null : r.clientName(), s.clientId()));
                }
            }
            days.add(new CalendarDay(d, overrides.containsKey(d), on, booked));
        }
        return new CalendarView(coach.coachTimezone(), now.toLocalDate(), now.toLocalTime().truncatedTo(ChronoUnit.MINUTES),
                hasSchedule, days);
    }
}
