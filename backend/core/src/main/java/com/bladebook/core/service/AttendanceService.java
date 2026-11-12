package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.AttendanceRepository.SeatOutcome;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.domain.Attendance;
import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.StudentRecord;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Attendance: captured on the rinkside page, corrected on the coach website's Lessons page (ADR-MASTER section 11;
 * FeatureDecriptions/Coach App and Coach lesson list). Capture is rinkside, correction is website-only (R1).
 *
 * <p>A guardian's contact details are fetched for one tap and logged when shown (ADR-MASTER section 18). Locally the
 * log is the application log (SC-12's shortcut).
 */
public final class AttendanceService {

    /** One skater in a lesson: the seat's "Ava P.", the coach's full name for them, what's shown, and the tap time. */
    public record Skater(String studentId, String shortName, String fullName, String familyName, Attendance.Shown status, Instant outcomeAt) {
    }

    /** One lesson time on the rinkside page: booked (with its skaters) or held. */
    public record RinkLesson(LessonTime time, List<Skater> skaters) {

        public RinkLesson {
            skaters = List.copyOf(skaters);
        }
    }

    public record RinkDay(String coachFirstName, String coachTimezone, LocalDate today, LocalTime now, List<RinkLesson> lessons) {

        public RinkDay {
            lessons = List.copyOf(lessons);
        }
    }

    /** A lesson that has happened, one row per skater, for the Lessons page. */
    public record PastLesson(LocalDate date, LocalTime startTime, int durationMinutes, Skater skater, List<String> sharedWith) {
    }

    public record Contact(String studentName, boolean isMinor, ClientRelationship relationship, String clientName, String phone, String email) {
    }

    static final String WRONG_TIME = "The phone’s time didn’t match the lesson, so it couldn’t be recorded.";
    static final String CANCELLED = "This lesson was cancelled, so there’s nothing to record.";
    static final String NOT_YET = "That lesson hasn’t happened yet.";
    /** The Lessons page's range: at most a year. */
    static final int MAX_DAYS = 366;

    private static final System.Logger ACCESS = System.getLogger("bladebook.pii-access");

    private final AttendanceRepository attendance;
    private final ScheduleRepository schedules;
    private final StudentRepository students;
    private final CoachRepository coaches;
    private final Clock clock;

    public AttendanceService(AttendanceRepository attendance, ScheduleRepository schedules, StudentRepository students,
                             CoachRepository coaches, Clock clock) {
        this.attendance = attendance;
        this.schedules = schedules;
        this.students = students;
        this.coaches = coaches;
        this.clock = clock;
    }

    /** Today's booked and held times, in the coach's time zone, with each skater's outcome. */
    public RinkDay today(AccessContext ctx) {
        CoachProfile coach = coach(ctx);
        Instant now = clock.instant();
        ZonedDateTime local = now.atZone(ZoneId.of(coach.coachTimezone()));
        LocalDate today = local.toLocalDate();
        Map<String, List<SeatOutcome>> byTime = byTime(attendance.seats(ctx, today, today));
        Map<String, StudentRecord> records = records(ctx);
        List<RinkLesson> out = new ArrayList<>();
        for (LessonTime t : schedules.lessonTimes(ctx, today, today)) {
            if (t.lessonStatus() == LessonTime.Status.OPEN) {
                continue;
            }
            List<Skater> in = byTime.getOrDefault(t.key(), List.of()).stream()
                    .filter(s -> s.seat().seatStatus() != Seat.Status.INVITED).map(s -> skater(s, records, now)).toList();
            out.add(new RinkLesson(t, in));
        }
        return new RinkDay(coach.firstName(), coach.coachTimezone(), today, local.toLocalTime().truncatedTo(ChronoUnit.MINUTES), out);
    }

    /**
     * Captures present or absent for one skater. A tap time that doesn't fit the lesson is refused; a seat already
     * recorded keeps what it has and answers as success; a seat that's gone (the family cancelled) says so.
     */
    public Skater record(AccessContext ctx, LocalDate date, LocalTime start, String studentId, String outcome, String outcomeAt) {
        Seat.Status status = Attendance.outcome(outcome);
        Instant at = instant(outcomeAt);
        Instant now = clock.instant();
        SeatOutcome seat = seat(ctx, date, start, studentId).orElseThrow(() -> DomainException.conflict(CANCELLED));
        if (!Attendance.fits(seat.seat().startsAtUtc(), seat.seat().coachTz(), at, now)) {
            throw DomainException.invalid("outcomeAt", WRONG_TIME);
        }
        if (attendance.capture(ctx, seat.seat().key(), status, at, now) == AttendanceRepository.Capture.GONE) {
            throw DomainException.conflict(CANCELLED);
        }
        return skater(seat(ctx, date, start, studentId).orElseThrow(() -> DomainException.conflict(CANCELLED)), records(ctx), now);
    }

    /** The family's contact details for one skater, for this tap only; every reveal is logged. */
    public Contact contact(AccessContext ctx, String studentId) {
        StudentRecord r = records(ctx).get(studentId);
        if (r == null) {
            throw DomainException.notFound("That skater couldn’t be found.");
        }
        ACCESS.log(System.Logger.Level.INFO, "contact-reveal coach={0} studentId={1} surface=rinkside", ctx.coachId(), studentId);
        return new Contact(r.studentName(), r.isMinor(), r.relationship(), r.clientName(), r.clientPhone(), r.clientEmail());
    }

    /** Every skater's lesson that has started, from {@code from} to {@code to}, oldest first. */
    public List<PastLesson> lessons(AccessContext ctx, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw DomainException.invalid("to", "The end date is before the start date.");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            throw DomainException.invalid("to", "Pick up to a year at a time.");
        }
        Instant now = clock.instant();
        Map<String, StudentRecord> records = records(ctx);
        Map<String, List<SeatOutcome>> byTime = byTime(attendance.seats(ctx, from, to));
        List<PastLesson> out = new ArrayList<>();
        for (List<SeatOutcome> in : byTime.values()) {
            List<SeatOutcome> booked = in.stream().filter(s -> s.seat().seatStatus() != Seat.Status.INVITED).toList();
            for (SeatOutcome s : booked) {
                if (s.seat().hasStarted(now)) {
                    List<String> others = booked.stream().filter(o -> o != s).map(o -> o.seat().studentName()).toList();
                    out.add(new PastLesson(s.seat().lessonDate(), s.seat().startTime(), s.seat().durationMinutes(), skater(s, records, now), others));
                }
            }
        }
        out.sort(Comparator.comparing(PastLesson::date).thenComparing(PastLesson::startTime).thenComparing(p -> p.skater().fullName()));
        return out;
    }

    /** The Lessons page: sets attended or no-show on a lesson that has started, whatever was recorded before. */
    public Skater correct(AccessContext ctx, LocalDate date, LocalTime start, String studentId, String outcome) {
        Seat.Status status = Attendance.outcome(outcome);
        Instant now = clock.instant();
        SeatOutcome seat = seat(ctx, date, start, studentId).orElseThrow(() -> DomainException.notFound("That lesson couldn’t be found."));
        if (!seat.seat().hasStarted(now)) {
            throw DomainException.conflict(NOT_YET);
        }
        if (!attendance.correct(ctx, seat.seat().key(), status, now)) {
            throw DomainException.notFound("That lesson couldn’t be found.");
        }
        return skater(seat(ctx, date, start, studentId).orElseThrow(), records(ctx), now);
    }

    // ---------------------------------------------------------------------- helpers

    private Optional<SeatOutcome> seat(AccessContext ctx, LocalDate date, LocalTime start, String studentId) {
        String key = Seat.key(date, start, studentId);
        return attendance.seats(ctx, date, date).stream().filter(s -> s.seat().key().equals(key)).findFirst();
    }

    private static Skater skater(SeatOutcome s, Map<String, StudentRecord> records, Instant now) {
        StudentRecord r = records.get(s.seat().studentId());
        return new Skater(s.seat().studentId(), s.seat().studentName(), r == null ? s.seat().studentName() : r.studentName(),
                r == null ? null : r.clientName(),
                Attendance.statusOf(s.seat().seatStatus(), s.seat().startsAtUtc(), s.seat().durationMinutes(), now), s.outcomeAt());
    }

    private static Map<String, List<SeatOutcome>> byTime(List<SeatOutcome> seats) {
        Map<String, List<SeatOutcome>> out = new java.util.LinkedHashMap<>();
        for (SeatOutcome s : seats) {
            out.computeIfAbsent(LessonTime.key(s.seat().lessonDate(), s.seat().startTime()), k -> new ArrayList<>()).add(s);
        }
        out.values().forEach(l -> l.sort(Comparator.comparing(s -> s.seat().joinedAt())));
        return out;
    }

    private Map<String, StudentRecord> records(AccessContext ctx) {
        Map<String, StudentRecord> out = new HashMap<>();
        students.list(ctx).forEach(r -> out.put(r.studentId(), r));
        return out;
    }

    private static Instant instant(String s) {
        try {
            return Instant.parse(s);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("outcomeAt", WRONG_TIME);
        }
    }

    private CoachProfile coach(AccessContext ctx) {
        return coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
    }
}
