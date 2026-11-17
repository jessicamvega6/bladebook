package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.FinancialRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.PaymentRepository.PaidSeat;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.domain.Attendance;
import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FinancialSummary;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Payment;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.StudentRecord;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;

/**
 * The coach's Payments page (ADR-MASTER section 12; FeatureDecriptions/Coach Payment Section on Dashboard.md): every
 * skater's lesson that has happened in a date range, at its share of the price, with mark paid (and how they paid),
 * waive (final, R7) and undo paid. Amounts are summed per currency, never across.
 */
public final class PaymentService {

    /**
     * One skater's lesson. {@code amountMinor}: the skater's share of the lesson time's price. {@code paidAt} only when
     * paid. {@code closedYear}: on a paid lesson whose payment counted in a year that has closed, that year, so the page
     * can warn before an undo (owner, 2026-11-16); otherwise null. {@code viewOnly}: dated before January 1 of last year in
     * the coach's time zone, so it can't be marked paid, have how they paid changed or be undone; an unpaid one can still
     * be waived (G-39, Batch 27).
     */
    public record Row(LocalDate date, LocalTime startTime, int durationMinutes, String studentId, String fullName, String familyName,
                      ClientRelationship relationship, Attendance.Shown attendance, int amountMinor, String currency,
                      Payment.Status status, Payment.Via paidVia, List<String> sharedWith, Instant paidAt, Integer closedYear,
                      boolean viewOnly) {
    }

    /** Totals per currency: unpaid, paid, and unpaid no-shows; with the counts the page's figures show. */
    public record Totals(Map<String, Long> unpaid, int unpaidCount, Map<String, Long> paid, int paidCount,
                         int noShows, Map<String, Long> noShowsUnpaid, int notRecorded) {
    }

    /** {@code thisYear}: the year it is now in the coach's time zone, which an undo of a closed year's payment counts in. */
    public record View(List<Row> rows, Totals totals, List<Payment.Via> choices, String currency, int thisYear) {

        public View {
            rows = List.copyOf(rows);
            choices = List.copyOf(choices);
        }
    }

    static final String CHANGED = "This lesson changed in another window. Reload the page and try again.";
    static final String NOT_YET = "That lesson hasn’t happened yet.";
    static final int MAX_DAYS = 366;

    private final PaymentRepository payments;
    private final ScheduleRepository schedules;
    private final StudentRepository students;
    private final CoachRepository coaches;
    private final Clock clock;
    private volatile ClosedYears closedYears;

    public PaymentService(PaymentRepository payments, ScheduleRepository schedules, StudentRepository students, CoachRepository coaches,
                          Clock clock) {
        this.payments = payments;
        this.schedules = schedules;
        this.students = students;
        this.coaches = coaches;
        this.clock = clock;
    }

    public View list(AccessContext ctx, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw DomainException.invalid("to", "The end date is before the start date.");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            throw DomainException.invalid("to", "Pick up to a year at a time.");
        }
        CoachProfile coach = coach(ctx);
        Instant now = clock.instant();
        ZoneId zone = ZoneId.of(coach.coachTimezone());
        LocalDate today = LocalDate.ofInstant(now, zone);
        int thisYear = today.getYear();
        Map<String, LessonTime> times = new HashMap<>();
        schedules.lessonTimes(ctx, from, to).forEach(t -> times.put(t.key(), t));
        Map<String, StudentRecord> records = records(ctx);
        Map<String, List<PaidSeat>> byTime = new LinkedHashMap<>();
        for (PaidSeat s : payments.seats(ctx, from, to)) {
            if (s.seat().seatStatus() != Seat.Status.INVITED && s.seat().hasStarted(now)) {
                byTime.computeIfAbsent(LessonTime.key(s.seat().lessonDate(), s.seat().startTime()), k -> new ArrayList<>()).add(s);
            }
        }
        List<Row> rows = new ArrayList<>();
        byTime.forEach((key, in) -> {
            in.sort(Comparator.comparing(s -> s.seat().joinedAt()));
            List<String> order = in.stream().map(s -> s.seat().studentId()).toList();
            for (PaidSeat s : in) {
                rows.add(row(s, times.get(key), in, order, records, now, coach, closedYear(s, zone, thisYear),
                        Payment.viewOnly(s.seat().lessonDate(), today)));
            }
        });
        rows.sort(Comparator.comparing(Row::date).thenComparing(Row::startTime).thenComparing(Row::fullName));
        return new View(rows, totals(rows), Payment.choices(coach.payments()), coach.currency().name(), thisYear);
    }

    /** Marks paid, or on a paid lesson changes how they paid. {@code paidVia} blank for none. */
    public Row markPaid(AccessContext ctx, LocalDate date, LocalTime start, String studentId, String paidVia) {
        CoachProfile coach = coach(ctx);
        PaidSeat s = happened(ctx, date, start, studentId);
        Payment.checkMarkPaid(s.status());
        Payment.checkChangeable(date, LocalDate.ofInstant(clock.instant(), ZoneId.of(coach.coachTimezone())));
        Payment.Via via = Payment.via(paidVia, coach.payments(), s.paidVia());
        if (!payments.markPaid(ctx, s.seat().key(), s.status(), via, clock.instant())) {
            throw DomainException.conflict(CHANGED);
        }
        return reread(ctx, date, start, studentId);
    }

    /**
     * Waives an unpaid lesson. It can't be undone (R7); the website always asks first. Allowed on a view-only lesson too
     * (owner, 2026-11-16), so an old unpaid lesson can still be settled; a waive never touches the figures.
     */
    public Row waive(AccessContext ctx, LocalDate date, LocalTime start, String studentId) {
        PaidSeat s = happened(ctx, date, start, studentId);
        Payment.checkWaive(s.status());
        if (!payments.waive(ctx, s.seat().key(), clock.instant())) {
            throw DomainException.conflict(CHANGED);
        }
        return reread(ctx, date, start, studentId);
    }

    /**
     * A paid lesson back to unpaid. When the year its payment counted in has closed, that year's figures are saved first
     * (if nothing has saved them yet), and the undo is written with a correction that counts in this year, flagged as
     * for an earlier year, so the closed year doesn't change (Batch 26; ADR-030 decision 4, amended 2026-11-16).
     */
    public Row undo(AccessContext ctx, LocalDate date, LocalTime start, String studentId) {
        PaidSeat s = happened(ctx, date, start, studentId);
        Payment.checkUndo(s.status());
        Instant now = clock.instant();
        ZoneId zone = ZoneId.of(coach(ctx).coachTimezone());
        Payment.checkChangeable(date, LocalDate.ofInstant(now, zone));
        OptionalInt counted = FinancialSummary.countedIn(date, s.paidAt(), zone);
        boolean done;
        if (closedYear(s, zone, LocalDate.ofInstant(now, zone).getYear()) != null) {
            if (closedYears == null) {
                throw new IllegalStateException("A closed year's payment can't be undone before its figures can be saved.");
            }
            closedYears.saveBeforeUndo(ctx, counted.getAsInt());
            Row was = reread(ctx, date, start, studentId);
            done = payments.undo(ctx, s.seat().key(), new FinancialRepository.Undone(now, s.seat().key(), date, start, studentId,
                    was.amountMinor(), was.currency(), counted.getAsInt()));
        } else {
            done = payments.undo(ctx, s.seat().key());
        }
        if (!done) {
            throw DomainException.conflict(CHANGED);
        }
        return reread(ctx, date, start, studentId);
    }

    /** Saves a closed year's figures, if nothing has yet, before one of its payments is undone (Batch 26). */
    public interface ClosedYears {
        void saveBeforeUndo(AccessContext ctx, int year);
    }

    /** Set by {@link FinancialService}, which reads this service to add a year up. */
    void closedYears(ClosedYears closedYears) {
        this.closedYears = closedYears;
    }

    // ---------------------------------------------------------------------- helpers

    /** The closed year a paid lesson's payment counted in, or null: unpaid, counted in this year, or in no year (G-39). */
    private static Integer closedYear(PaidSeat s, ZoneId zone, int thisYear) {
        if (s.status() != Payment.Status.PAID) {
            return null;
        }
        OptionalInt counted = FinancialSummary.countedIn(s.seat().lessonDate(), s.paidAt(), zone);
        return counted.isPresent() && counted.getAsInt() < thisYear ? counted.getAsInt() : null;
    }

    private PaidSeat happened(AccessContext ctx, LocalDate date, LocalTime start, String studentId) {
        String key = Seat.key(date, start, studentId);
        PaidSeat s = payments.seats(ctx, date, date).stream().filter(x -> x.seat().key().equals(key)).findFirst()
                .orElseThrow(() -> DomainException.notFound("That lesson couldn’t be found."));
        if (!s.seat().hasStarted(clock.instant())) {
            throw DomainException.conflict(NOT_YET);
        }
        return s;
    }

    private Row reread(AccessContext ctx, LocalDate date, LocalTime start, String studentId) {
        return list(ctx, date, date).rows().stream()
                .filter(r -> r.studentId().equals(studentId) && r.startTime().equals(start)).findFirst().orElseThrow();
    }

    private static Row row(PaidSeat s, LessonTime t, List<PaidSeat> in, List<String> order, Map<String, StudentRecord> records,
                           Instant now, CoachProfile coach, Integer closedYear, boolean viewOnly) {
        StudentRecord r = records.get(s.seat().studentId());
        int amount = t == null ? 0 : t.shareFor(t.priceMinor(), s.seat().studentId(), order);
        List<String> others = in.stream().filter(o -> o != s).map(o -> o.seat().studentName()).toList();
        return new Row(s.seat().lessonDate(), s.seat().startTime(), s.seat().durationMinutes(), s.seat().studentId(),
                r == null ? s.seat().studentName() : r.studentName(), r == null ? null : r.clientName(),
                r == null ? null : r.relationship(),
                Attendance.statusOf(s.seat().seatStatus(), s.seat().startsAtUtc(), s.seat().durationMinutes(), now),
                amount, t == null ? coach.currency().name() : t.currency(), s.status(), s.paidVia(), others, s.paidAt(), closedYear, viewOnly);
    }

    private static Totals totals(List<Row> rows) {
        List<Row> unpaid = rows.stream().filter(r -> r.status() == Payment.Status.UNPAID).toList();
        List<Row> paid = rows.stream().filter(r -> r.status() == Payment.Status.PAID).toList();
        List<Row> noShows = rows.stream().filter(r -> r.attendance() == Attendance.Shown.NO_SHOW).toList();
        return new Totals(sum(unpaid), unpaid.size(), sum(paid), paid.size(), noShows.size(),
                sum(noShows.stream().filter(r -> r.status() == Payment.Status.UNPAID).toList()),
                (int) rows.stream().filter(r -> r.attendance() == Attendance.Shown.NOT_RECORDED).count());
    }

    private static Map<String, Long> sum(List<Row> rows) {
        return Payment.totals(rows.stream().map(r -> new Payment.Amount(r.amountMinor(), r.currency())).toList());
    }

    private Map<String, StudentRecord> records(AccessContext ctx) {
        Map<String, StudentRecord> out = new HashMap<>();
        students.list(ctx).forEach(r -> out.put(r.studentId(), r));
        return out;
    }

    private CoachProfile coach(AccessContext ctx) {
        return coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
    }
}
