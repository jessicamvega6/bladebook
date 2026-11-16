package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.TodayBoard;
import com.bladebook.core.domain.Weeks;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The coach website's Today page (G-6, Batch 22; MVP feature 9's home page; design {@code coach/static/today.html};
 * FeatureDecriptions/Coach Dashboard on website.md): today's lessons, the week's lessons and amount booked, and the
 * unpaid total for lessons that have happened. It only reads what Batches 4 to 8 write: lesson times, seats and their
 * payment status, and the coach's own {@code STUDENT#} records for names. Skaters waiting for approval are counted by
 * the page from the Students list it already loads.
 *
 * <p>Reads, in the coach's time zone: the lesson times and seats from the earlier of this week's Sunday and the oldest
 * unpaid lesson (GSI3, access pattern 11) to Saturday. When today has nothing and the week has nothing after today, the
 * seats from Sunday on to the end of what's stored, once, to say when the next lesson is.
 */
public final class TodayService {

    /**
     * {@code now}: the coach's local time, to the minute. {@code nextLessonDate}: only when today has no lessons, the
     * next date with one ({@code null} when nothing is booked after today). {@code currency}: the coach's.
     */
    public record View(String coachTimezone, String currency, LocalDate today, LocalTime now, LocalDate weekStart, LocalDate weekEnd,
                       List<TodayBoard.Lesson> lessons, LocalDate nextLessonDate, TodayBoard.Figures week, TodayBoard.Figures unpaid) {

        public View {
            lessons = List.copyOf(lessons);
        }
    }

    private final PaymentRepository payments;
    private final ScheduleRepository schedules;
    private final StudentRepository students;
    private final CoachRepository coaches;
    private final Clock clock;

    public TodayService(PaymentRepository payments, ScheduleRepository schedules, StudentRepository students, CoachRepository coaches,
                        Clock clock) {
        this.payments = payments;
        this.schedules = schedules;
        this.students = students;
        this.coaches = coaches;
        this.clock = clock;
    }

    public View today(AccessContext ctx) {
        CoachProfile coach = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
        String currency = coach.currency().name();
        Instant now = clock.instant();
        ZonedDateTime local = now.atZone(ZoneId.of(coach.coachTimezone()));
        LocalDate today = local.toLocalDate();
        LocalDate sunday = Weeks.sunday(today);
        LocalDate saturday = sunday.plusDays(6);
        LocalDate from = payments.oldestUnpaid(ctx).filter(d -> d.isBefore(sunday)).orElse(sunday);

        Map<String, String> names = new HashMap<>();
        students.list(ctx).forEach(r -> names.put(r.studentId(), r.studentName()));
        List<LessonTime> times = schedules.lessonTimes(ctx, from, saturday);
        TodayBoard board = new TodayBoard(times, boardSeats(ctx, from, saturday), names, currency, now);

        List<TodayBoard.Lesson> lessons = board.day(today);
        LocalDate next = null;
        if (lessons.isEmpty()) {
            next = board.nextLessonAfter(today).orElseGet(() ->
                    new TodayBoard(List.of(), boardSeats(ctx, saturday.plusDays(1), Weeks.storeUntil(today)), names, currency, now)
                            .nextLessonAfter(today).orElse(null));
        }
        return new View(coach.coachTimezone(), currency, today, local.toLocalTime().truncatedTo(ChronoUnit.MINUTES), sunday, saturday,
                lessons, next, board.booked(sunday, saturday), board.unpaid());
    }

    private List<TodayBoard.BoardSeat> boardSeats(AccessContext ctx, LocalDate from, LocalDate to) {
        return payments.seats(ctx, from, to).stream().map(s -> new TodayBoard.BoardSeat(s.seat(), s.status())).toList();
    }
}
