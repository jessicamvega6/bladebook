package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.AfterCancel;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelDays;
import com.bladebook.core.domain.CoachCancelPlan;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.TempSchedule;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The coach cancels from the calendar: one lesson, a day, or the rest of the week (ADR-MASTER section 10, "By the
 * coach"). Cancelling never changes the schedule and is never charged. Every line records {@code cancelledBy = COACH}.
 *
 * <p>A single lesson is a batch of one: header, line and lesson time in one transaction, with the coach's release-or-hold
 * choice. A lesson that changed since it was read is read again once and re-planned; one that has started or gone by then
 * is left alone.
 *
 * <p><b>A day or the rest of the week is time off</b> (owner, 2026-11-18, I24): those dates become a time off named
 * "Cancelled" (or, inside a special schedule, no lessons on those dates), and the schedule change cancels their booked
 * lessons in one planned batch, recorded as the coach's ({@code cancelledBy = COACH}, {@code batchSource} {@code DAY} or
 * {@code WEEK}), so families get the "cancelled by the coach" email and a cancel that stops part-way is finished like any
 * schedule change. No release-or-hold question. The rest of the week starts now: lessons that have started stay.
 */
public final class CoachCancelService {

    /** What was done: {@code families} each get one email (the notification batch sends them). */
    public record Result(int cancelled, int held, int openHeld, int families, int skipped) {
    }

    static final String NOTHING = "These lessons have already started or were cancelled.";

    private final ScheduleRepository schedules;
    private final CancellationRepository cancels;
    private final ScheduleChangeService change;
    private final CoachRepository coaches;
    private final Clock clock;

    public CoachCancelService(ScheduleRepository schedules, CancellationRepository cancels, ScheduleChangeService change,
                              CoachRepository coaches, Clock clock) {
        this.schedules = schedules;
        this.cancels = cancels;
        this.change = change;
        this.coaches = coaches;
        this.clock = clock;
    }

    public Result cancel(AccessContext ctx, CoachCancelRequest request) {
        if (request.scope() == ChangeBatch.Source.DAY || request.scope() == ChangeBatch.Source.WEEK) {
            return timeOff(ctx, request);
        }
        Instant now = clock.instant();
        CoachCancelPlan plan = CoachCancelPlan.of(request, schedules.lessonTimes(ctx, request.first(), request.last()),
                schedules.seats(ctx, request.first(), request.last()), now);
        if (plan.isEmpty()) {
            throw DomainException.conflict(NOTHING);
        }
        ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, request.scope(), ChangeBatch.By.COACH, ctx.coachId(),
                plan.firstDate(), plan.lastDate(), plan.cancels().size(), plan.clientIds().size(), ChangeBatch.Execution.PLANNED);

        // One lesson: header, lines and lesson time in one transaction, so it can't stop part-way.
        CoachCancelPlan.Cancel only = plan.cancels().get(0);
        ChangeBatch done = batch.executed(1, plan.clientIds().size());
        Optional<CoachCancelPlan.Cancel> written = writeAlone(ctx, done, only, now)
                .or(() -> reread(ctx, only.time(), only.after(), now).flatMap(fresh -> writeAlone(ctx, done, fresh, now)));
        CoachCancelPlan.Cancel c = written.orElseThrow(() -> DomainException.conflict(NOTHING));
        int families = (int) c.bookedSeats().stream().map(Seat::clientId).distinct().count();
        return new Result(1, c.after() == AfterCancel.HOLD ? 1 : 0, 0, families, plan.skipped());
    }

    /** A day or the rest of the week: time off on those dates, from today on, then the schedule change as the coach's. */
    private Result timeOff(AccessContext ctx, CoachCancelRequest request) {
        String zone = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."))
                .coachTimezone();
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of(zone));
        LocalDate first = request.first().isBefore(today) ? today : request.first();
        CoachCancelDays.Plan plan = CoachCancelDays.plan(first, request.last(), schedules.temps(ctx));
        if (plan.isEmpty()) {
            throw DomainException.conflict(NOTHING);
        }
        // What the days' time off cancels, read before it's saved: booked lessons not started, nobody checked in. The time
        // off's write also sets off consumer-schedule-change, which may cancel them before the apply below does; either
        // way it's the same schedule change and the same one email per family (owner, 2026-11-21, I35), so the coach is
        // told this count, not whichever run got there.
        Instant now = clock.instant();
        Map<String, List<Seat>> seats = schedules.seats(ctx, first, request.last()).stream()
                .collect(Collectors.groupingBy(s -> LessonTime.key(s.lessonDate(), s.startTime())));
        List<List<Seat>> cancelled = schedules.lessonTimes(ctx, first, request.last()).stream()
                .filter(t -> t.lessonStatus() == LessonTime.Status.BOOKED && t.startsAtUtc().isAfter(now))
                .map(t -> seats.getOrDefault(t.key(), List.of()))
                .filter(in -> in.stream().noneMatch(s -> s.seatStatus() == Seat.Status.CHECKED_IN || s.seatStatus() == Seat.Status.NO_SHOW))
                .filter(in -> in.stream().anyMatch(s -> s.seatStatus() == Seat.Status.BOOKED))
                .toList();
        int families = (int) cancelled.stream().flatMap(List::stream).filter(s -> s.seatStatus() == Seat.Status.BOOKED)
                .map(Seat::clientId).distinct().count();

        for (TempSchedule t : plan.newTimeOff()) {
            schedules.saveTemp(ctx, new TempSchedule(UUID.randomUUID().toString(), t.kind(), t.name(), t.startDate(), t.endDate(),
                    t.templates(), t.off()), null);
        }
        for (CoachCancelDays.Change c : plan.specials()) {
            schedules.saveTemp(ctx, c.after(), c.before());
        }
        change.apply(ctx, request.scope(), ChangeBatch.By.SCHEDULE_CHANGE);
        return new Result(cancelled.size(), 0, 0, families, 0);
    }

    /** The whole batch is this one lesson: header, lines and lesson time in one transaction. */
    private Optional<CoachCancelPlan.Cancel> writeAlone(AccessContext ctx, ChangeBatch done, CoachCancelPlan.Cancel c, Instant now) {
        ChangeBatch header = done.executed(1, (int) c.bookedSeats().stream().map(Seat::clientId).distinct().count());
        return cancels.cancelByCoach(ctx, header, c, lines(header, c, now), header, now) ? Optional.of(c) : Optional.empty();
    }

    /** The lesson as it is now, if it can still be cancelled. */
    private Optional<CoachCancelPlan.Cancel> reread(AccessContext ctx, LessonTime was, AfterCancel after, Instant now) {
        CoachCancelRequest one = CoachCancelRequest.parse("LESSON", List.of(new CoachCancelRequest.PickInput(
                was.lessonDate().toString(), was.startTime().toString(), after.name())), null);
        CoachCancelPlan p = CoachCancelPlan.of(one, schedules.lessonTimes(ctx, was.lessonDate(), was.lessonDate()),
                schedules.seats(ctx, was.lessonDate(), was.lessonDate()), now);
        return p.cancels().stream().findFirst();
    }

    /** A line per booked seat, each at its share of the price: shares split in the order the skaters joined. */
    private static List<CancellationLine> lines(ChangeBatch batch, CoachCancelPlan.Cancel c, Instant now) {
        List<Seat> booked = c.bookedSeats().stream().sorted(Comparator.comparing(Seat::joinedAt)).toList();
        List<String> order = booked.stream().map(Seat::studentId).toList();
        List<CancellationLine> out = new ArrayList<>();
        for (Seat s : booked) {
            out.add(CancellationLine.of(batch, s, c.time().shareFor(c.time().priceMinor(), s.studentId(), order),
                    c.time().currency(), now));
        }
        return out;
    }
}
