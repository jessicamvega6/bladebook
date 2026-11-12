package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ChangeBatchRepository;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.LessonTimes;
import com.bladebook.core.domain.PriceChange;
import com.bladebook.core.domain.PriceShare;
import com.bladebook.core.domain.RepriceLine;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.ScheduleRules;
import com.bladebook.core.domain.TempSchedule;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Weeks;
import com.bladebook.core.domain.WeeklySchedule;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * What a schedule change does to lesson times (ADR-MASTER section 9), from the one evaluator, {@link ScheduleChange}.
 *
 * <p>{@link #preview} answers the review page before anything is written. {@link #apply} is what
 * {@code consumer-schedule-change} does after the save (locally an api-coach dispatcher calls it straight after, SC-5):
 * open times are added, removed and updated; then, read again so a booking made since is included, each booked lesson
 * the change cancels or re-prices goes through a change batch, its lines planned first and carried out one lesson at a
 * time. Running it twice has one effect: the second run finds nothing left to change.
 */
public final class ScheduleChangeService {

    public record Result(int added, int removed, int replaced, int skipped, int cancelled, int repriced, int families) {
    }

    /** A skater in an affected lesson, by the seat's display name ("Ava P."). */
    public record Who(String studentId, String name, String familyId) {
    }

    /** One booked lesson the change affects: its price now, and the new one for a re-price. */
    public record Impact(LocalDate date, LocalTime startTime, int durationMinutes, int priceMinor, Integer newPriceMinor, List<Who> skaters) {
    }

    /** The review page (ADR-MASTER section 9, "The preview"). It is advisory: the save decides. */
    public record Preview(List<Impact> cancel, List<Impact> reprice, List<Impact> kept, int families, List<PriceChange> big) {
    }

    /** The newest schedule-change batch: {@code stuck} once it's over an hour old and not {@code EXECUTED}. */
    public record Status(ChangeBatch batch, boolean stuck, List<CancellationLine> passed) {
    }

    /** The drift check's threshold, which the save status shares (C_Coach Schedule Save Status.md). */
    static final Duration STUCK = Duration.ofHours(1);

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;
    private final ChangeBatchRepository batches;
    private final Clock clock;

    public ScheduleChangeService(ScheduleRepository schedules, CoachRepository coaches, Clock clock) {
        this.schedules = schedules;
        this.coaches = coaches;
        this.batches = schedules.changeBatches();
        this.clock = clock;
    }

    /** After a weekly schedule save. */
    public Result apply(AccessContext ctx) {
        return apply(ctx, ChangeBatch.Source.DEFAULT);
    }

    public Result apply(AccessContext ctx, ChangeBatch.Source source) {
        CoachProfile coach = coach(ctx);
        ZoneId zone = ZoneId.of(coach.coachTimezone());
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate until = Weeks.storeUntil(today);
        WeeklySchedule weekly = schedules.findDefault(ctx).orElse(null);
        List<LessonTime> desired = LessonTimes.make(weekly, schedules.overrides(ctx, today, until), today, until, zone,
                coach.currency().name(), coach.requiredNoticeHours(), now);

        ScheduleRepository.Applied done = schedules.apply(ctx, ScheduleChange.plan(schedules.lessonTimes(ctx, today, until), desired, now));
        // Read again: a time booked since the first read is cancelled or re-priced in this batch (ADR-MASTER section 9).
        ScheduleChange booked = ScheduleChange.plan(schedules.lessonTimes(ctx, today, until), desired, now);
        if (!booked.touchesBookings()) {
            return new Result(done.added(), done.removed(), done.replaced(), done.skipped(), 0, 0, 0);
        }
        Map<String, List<Seat>> seats = seatsByTime(schedules.seats(ctx, today, until));
        int[] counts = runBatch(ctx, source, booked, seats, now);
        return new Result(done.added(), done.removed(), done.replaced(), done.skipped(), counts[0], counts[1], counts[2]);
    }

    /** Header, planned lines, then each lesson in its own transaction, then the header {@code EXECUTED}. */
    private int[] runBatch(AccessContext ctx, ChangeBatch.Source source, ScheduleChange plan, Map<String, List<Seat>> seats, Instant now) {
        List<LocalDate> dates = new ArrayList<>();
        plan.cancel().forEach(c -> dates.add(c.time().lessonDate()));
        plan.reprice().forEach(r -> dates.add(r.time().lessonDate()));
        Set<String> families = new LinkedHashSet<>();
        plan.cancel().forEach(c -> bookedIn(seats, c.time()).forEach(s -> families.add(s.clientId())));
        plan.reprice().forEach(r -> bookedIn(seats, r.time()).forEach(s -> families.add(s.clientId())));
        ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, source, ChangeBatch.By.SCHEDULE_CHANGE, ctx.coachId(),
                dates.stream().min(Comparator.naturalOrder()).orElse(null), dates.stream().max(Comparator.naturalOrder()).orElse(null),
                plan.cancel().size() + plan.reprice().size(), families.size(), ChangeBatch.Execution.PLANNED);
        batches.begin(ctx, batch);

        Map<String, List<CancellationLine>> cancelLines = new HashMap<>();
        Map<String, List<RepriceLine>> repriceLines = new HashMap<>();
        for (ScheduleChange.Cancel c : plan.cancel()) {
            List<Seat> in = bookedIn(seats, c.time());
            List<String> order = in.stream().map(Seat::studentId).toList();
            cancelLines.put(c.time().key(), in.stream().map(s -> CancellationLine.of(batch, s,
                    PriceShare.of(c.time().priceMinor(), in.size(), order, s.studentId()), c.time().currency(), now)
                    .withStatus(ChangeBatch.Execution.PLANNED)).toList());
        }
        for (ScheduleChange.Reprice r : plan.reprice()) {
            List<Seat> in = bookedIn(seats, r.time());
            List<String> order = in.stream().map(Seat::studentId).toList();
            repriceLines.put(r.time().key(), in.stream().map(s -> RepriceLine.planned(batch, s,
                    PriceShare.of(r.time().priceMinor(), in.size(), order, s.studentId()),
                    PriceShare.of(r.newPriceMinor(), in.size(), order, s.studentId()), r.time().currency())).toList());
        }
        batches.plan(ctx, batch, cancelLines.values().stream().flatMap(List::stream).toList(),
                repriceLines.values().stream().flatMap(List::stream).toList());

        int cancelled = 0, repriced = 0;
        Set<String> told = new LinkedHashSet<>();
        for (ScheduleChange.Cancel c : plan.cancel()) {
            List<String> keys = cancelLines.get(c.time().key()).stream().map(CancellationLine::key).toList();
            List<Seat> all = seats.getOrDefault(c.time().key(), List.of());
            if (batches.cancel(ctx, c.time(), all, c.replacement(), keys, clock.instant())) {
                cancelled++;
                bookedIn(seats, c.time()).forEach(s -> told.add(s.clientId()));
            } else {
                batches.skip(ctx, keys, c.time().startsAtUtc().isAfter(clock.instant()) ? "BOOKING_GONE" : "LESSON_PASSED");
            }
        }
        for (ScheduleChange.Reprice r : plan.reprice()) {
            List<String> keys = repriceLines.get(r.time().key()).stream().map(RepriceLine::key).toList();
            if (batches.reprice(ctx, r.time(), r.newPriceMinor(), keys, clock.instant())) {
                repriced++;
                bookedIn(seats, r.time()).forEach(s -> told.add(s.clientId()));
            } else {
                batches.skip(ctx, keys, r.time().startsAtUtc().isAfter(clock.instant()) ? "BOOKING_GONE" : "LESSON_PASSED");
            }
        }
        batches.finish(ctx, batch.executed(cancelled + repriced, told.size()));
        return new int[] {cancelled, repriced, told.size()};
    }

    // ---------------------------------------------------------------------- preview

    /**
     * What saving would do to booked lessons, with the proposed weekly schedule and date items in place of the
     * stored ones. Only dates for which {@code onlyDates} is true are reported (a dated change reports its own dates).
     */
    public Preview preview(AccessContext ctx, WeeklySchedule weekly, Map<LocalDate, List<ScheduleBlock>> overrides,
                           Predicate<LocalDate> onlyDates, List<PriceChange> big) {
        CoachProfile coach = coach(ctx);
        ZoneId zone = ZoneId.of(coach.coachTimezone());
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate until = Weeks.storeUntil(today);
        List<LessonTime> desired = LessonTimes.make(weekly, overrides, today, until, zone, coach.currency().name(),
                coach.requiredNoticeHours(), now);
        ScheduleChange plan = ScheduleChange.plan(schedules.lessonTimes(ctx, today, until), desired, now);
        Map<String, List<Seat>> seats = seatsByTime(schedules.seats(ctx, today, until));
        List<Impact> cancel = new ArrayList<>(), reprice = new ArrayList<>(), kept = new ArrayList<>();
        Set<String> families = new LinkedHashSet<>();
        for (ScheduleChange.Cancel c : plan.cancel()) {
            if (onlyDates.test(c.time().lessonDate())) {
                cancel.add(impact(c.time(), null, seats, families));
            }
        }
        for (ScheduleChange.Reprice r : plan.reprice()) {
            if (onlyDates.test(r.time().lessonDate())) {
                reprice.add(impact(r.time(), r.newPriceMinor(), seats, families));
            }
        }
        for (ScheduleChange.Reprice r : plan.kept()) {
            if (onlyDates.test(r.time().lessonDate())) {
                kept.add(impact(r.time(), r.newPriceMinor(), seats, null));
            }
        }
        return new Preview(cancel, reprice, kept, families.size(), big);
    }

    /**
     * The review of a weekly schedule change: every problem refuses it, as the save would; a block whose price moves
     * by half or more is listed to acknowledge. Dates under time off or a special schedule aren't reported: a weekly
     * change doesn't reach them.
     */
    public Preview previewWeekly(AccessContext ctx, List<BlockTemplate> templates) {
        List<String> problems = ScheduleRules.problems(templates);
        if (!problems.isEmpty()) {
            throw DomainException.invalid("blocks", String.join("\n", problems));
        }
        Optional<WeeklySchedule> saved = schedules.findDefault(ctx);
        WeeklySchedule proposed = new WeeklySchedule(ScheduleRules.blocks(templates), saved.map(WeeklySchedule::scheduleVersion).orElse(0L) + 1);
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of(coach(ctx).coachTimezone()));
        Map<LocalDate, List<ScheduleBlock>> overrides = schedules.overrides(ctx, today, Weeks.storeUntil(today));
        return preview(ctx, proposed, overrides, d -> !overrides.containsKey(d),
                PriceChange.big(saved.map(ScheduleRules::fromWeekly).orElse(List.of()), templates));
    }

    /** The review of time off or a special schedule: only its dates, old and new, are reported. */
    public Preview previewTemp(AccessContext ctx, TempSchedule proposed, TempSchedule previous) {
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of(coach(ctx).coachTimezone()));
        Map<LocalDate, List<ScheduleBlock>> overrides = new HashMap<>(schedules.overrides(ctx, today, Weeks.storeUntil(today)));
        if (previous != null) {
            previous.dates().forEach(overrides::remove);
        }
        overrides.putAll(proposed.dateBlocks());
        List<PriceChange> big = previous == null ? List.of() : PriceChange.big(previous.templates(), proposed.templates());
        return preview(ctx, schedules.findDefault(ctx).orElse(null), overrides,
                d -> proposed.covers(d) || (previous != null && previous.covers(d)), big);
    }

    /** The newest schedule-change batch, for the save status. */
    public Optional<Status> status(AccessContext ctx) {
        Instant now = clock.instant();
        return batches.latest(ctx).map(l -> new Status(l.batch(),
                l.batch().executionStatus() != ChangeBatch.Execution.EXECUTED && l.batch().createdAt().plus(STUCK).isBefore(now), l.passed()));
    }

    // ---------------------------------------------------------------------- helpers

    private static Impact impact(LessonTime t, Integer newPrice, Map<String, List<Seat>> seats, Set<String> families) {
        List<Who> who = bookedIn(seats, t).stream().map(s -> new Who(s.studentId(), s.studentName(), s.clientId())).toList();
        if (families != null) {
            who.forEach(w -> families.add(w.familyId()));
        }
        return new Impact(t.lessonDate(), t.startTime(), t.durationMinutes(), t.priceMinor(), newPrice, who);
    }

    private static Map<String, List<Seat>> seatsByTime(List<Seat> seats) {
        Map<String, List<Seat>> out = new HashMap<>();
        for (Seat s : seats) {
            out.computeIfAbsent(LessonTime.key(s.lessonDate(), s.startTime()), k -> new ArrayList<>()).add(s);
        }
        out.values().forEach(l -> l.sort(Comparator.comparing(Seat::joinedAt)));
        return out;
    }

    private static List<Seat> bookedIn(Map<String, List<Seat>> seats, LessonTime t) {
        return seats.getOrDefault(t.key(), List.of()).stream().filter(s -> s.seatStatus() == Seat.Status.BOOKED).toList();
    }

    private CoachProfile coach(AccessContext ctx) {
        return coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
    }
}
