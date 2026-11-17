package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelPlan;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.Weeks;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The rinkside page's Week tab (Batch 23, G-28; ADR-MASTER section 10 "From the rinkside page"; ADR-009 d5a;
 * FeatureDecriptions/C_Rinkside Cancel Several Lessons.md): each day from today to Saturday, in the coach's time zone,
 * with the lessons that can still be cancelled, how many have started, and the open times.
 *
 * <p>What it lists is worked out by {@link CoachCancelPlan} for the whole week, the same plan <i>Cancel rest of week</i>
 * carries out, so the tab shows exactly what that cancel would close. Read with signal only: the phone keeps today's
 * lessons and nothing else (R5).
 */
public final class RinksideWeekService {

    /** A skater in a lesson: the seat's "Ava P.", the family's name for the confirmation, and the family, to count emails. */
    public record WeekSkater(String studentId, String shortName, String familyName, String familyId) {
    }

    /** A booked lesson that can still be cancelled. */
    public record WeekLesson(LocalDate date, LocalTime startTime, int durationMinutes, List<WeekSkater> skaters) {

        public WeekLesson {
            skaters = List.copyOf(skaters);
        }
    }

    /** An open time that hasn't started: <i>Cancel rest of week</i> holds it too (S8). */
    public record OpenTime(LocalDate date, LocalTime startTime, int durationMinutes) {
    }

    /** {@code started}: booked lessons that day that can't be cancelled any more (started, or already marked). */
    public record WeekDay(LocalDate date, List<WeekLesson> lessons, int started, List<OpenTime> open) {

        public WeekDay {
            lessons = List.copyOf(lessons);
            open = List.copyOf(open);
        }
    }

    /** {@code today}, {@code now} and {@code weekStart} (its Sunday) are the coach's, in the coach's time zone. */
    public record RinkWeek(String coachTimezone, LocalDate today, LocalTime now, LocalDate weekStart, List<WeekDay> days) {

        public RinkWeek {
            days = List.copyOf(days);
        }
    }

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;
    private final StudentRepository students;
    private final Clock clock;

    public RinksideWeekService(ScheduleRepository schedules, CoachRepository coaches, StudentRepository students, Clock clock) {
        this.schedules = schedules;
        this.coaches = coaches;
        this.students = students;
        this.clock = clock;
    }

    public RinkWeek week(AccessContext ctx) {
        CoachProfile coach = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
        Instant now = clock.instant();
        ZonedDateTime local = now.atZone(ZoneId.of(coach.coachTimezone()));
        LocalDate today = local.toLocalDate();
        LocalDate sunday = Weeks.sunday(today);
        LocalDate saturday = sunday.plusDays(6);

        List<LessonTime> times = schedules.lessonTimes(ctx, today, saturday);
        List<Seat> seats = schedules.seats(ctx, today, saturday);
        CoachCancelPlan plan = CoachCancelPlan.of(new CoachCancelRequest(ChangeBatch.Source.WEEK, List.of(), sunday), times, seats, now);

        Map<String, StudentRecord> records = new HashMap<>();
        if (!plan.cancels().isEmpty()) {
            students.list(ctx).forEach(r -> records.put(r.studentId(), r));
        }
        Map<String, List<Seat>> byTime = new HashMap<>();
        for (Seat s : seats) {
            byTime.computeIfAbsent(LessonTime.key(s.lessonDate(), s.startTime()), k -> new ArrayList<>()).add(s);
        }

        List<WeekDay> days = new ArrayList<>();
        for (LocalDate d = today; !d.isAfter(saturday); d = d.plusDays(1)) {
            LocalDate day = d;
            List<WeekLesson> lessons = plan.cancels().stream().filter(c -> c.time().lessonDate().equals(day))
                    .map(c -> lesson(c.time(), c.bookedSeats(), records)).toList();
            List<OpenTime> open = plan.holdOpen().stream().filter(t -> t.lessonDate().equals(day))
                    .map(t -> new OpenTime(t.lessonDate(), t.startTime(), t.durationMinutes())).toList();
            int booked = (int) times.stream().filter(t -> t.lessonDate().equals(day) && t.lessonStatus() == LessonTime.Status.BOOKED
                    && byTime.getOrDefault(t.key(), List.of()).stream().anyMatch(s -> s.seatStatus() != Seat.Status.INVITED)).count();
            days.add(new WeekDay(day, lessons, booked - lessons.size(), open));
        }
        return new RinkWeek(coach.coachTimezone(), today, local.toLocalTime().truncatedTo(ChronoUnit.MINUTES), sunday, days);
    }

    /** The skaters in the lesson, in the order they joined; an unanswered invitation isn't one of them (S11). */
    private static WeekLesson lesson(LessonTime t, List<Seat> booked, Map<String, StudentRecord> records) {
        List<WeekSkater> skaters = booked.stream().sorted(Comparator.comparing(Seat::joinedAt)).map(s -> {
            StudentRecord r = records.get(s.studentId());
            return new WeekSkater(s.studentId(), s.studentName(), r == null ? null : r.clientName(), s.clientId());
        }).toList();
        return new WeekLesson(t.lessonDate(), t.startTime(), t.durationMinutes(), skaters);
    }
}
