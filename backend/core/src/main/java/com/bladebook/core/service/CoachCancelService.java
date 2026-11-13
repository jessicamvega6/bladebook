package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.AfterCancel;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelPlan;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The coach cancels from the calendar: one lesson, a day, or the rest of the week (ADR-MASTER section 10, "By the
 * coach"). Cancelling never changes the schedule and is never charged. Every line records {@code cancelledBy = COACH}.
 *
 * <p>A single lesson is a batch of one: header, line and lesson time in one transaction. Anything larger writes its
 * header first ({@code PLANNED}), then each lesson in its own transaction, then marks the header {@code EXECUTED}
 * with what was done. A lesson that changed since it was read is read again once and re-planned; one that has
 * started or gone by then is left alone.
 */
public final class CoachCancelService {

    /** What was done: {@code families} each get one email (the notification batch sends them). */
    public record Result(int cancelled, int held, int openHeld, int families, int skipped) {
    }

    static final String NOTHING = "These lessons have already started or were cancelled.";

    private final ScheduleRepository schedules;
    private final CancellationRepository cancels;
    private final Clock clock;

    public CoachCancelService(ScheduleRepository schedules, CancellationRepository cancels, Clock clock) {
        this.schedules = schedules;
        this.cancels = cancels;
        this.clock = clock;
    }

    public Result cancel(AccessContext ctx, CoachCancelRequest request) {
        Instant now = clock.instant();
        CoachCancelPlan plan = CoachCancelPlan.of(request, schedules.lessonTimes(ctx, request.first(), request.last()),
                schedules.seats(ctx, request.first(), request.last()), now);
        if (plan.isEmpty()) {
            throw DomainException.conflict(NOTHING);
        }
        ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, request.scope(), ChangeBatch.By.COACH, ctx.coachId(),
                plan.firstDate(), plan.lastDate(), plan.cancels().size(), plan.clientIds().size(), ChangeBatch.Execution.PLANNED);

        if (plan.cancels().size() == 1 && plan.holdOpen().isEmpty()) {
            CoachCancelPlan.Cancel only = plan.cancels().get(0);
            ChangeBatch done = batch.executed(1, plan.clientIds().size());
            Optional<CoachCancelPlan.Cancel> written = writeAlone(ctx, done, only, now)
                    .or(() -> reread(ctx, only.time(), only.after(), now).flatMap(fresh -> writeAlone(ctx, done, fresh, now)));
            CoachCancelPlan.Cancel c = written.orElseThrow(() -> DomainException.conflict(NOTHING));
            int families = (int) c.bookedSeats().stream().map(Seat::clientId).distinct().count();
            return new Result(1, c.after() == AfterCancel.HOLD ? 1 : 0, 0, families, plan.skipped());
        }

        cancels.start(ctx, batch);
        int cancelled = 0, held = 0, openHeld = 0, skipped = plan.skipped();
        Set<String> families = new LinkedHashSet<>();
        for (CoachCancelPlan.Cancel c : plan.cancels()) {
            Optional<CoachCancelPlan.Cancel> done = cancelOne(ctx, batch, c, now);
            if (done.isPresent()) {
                cancelled++;
                held += c.after() == AfterCancel.HOLD ? 1 : 0;
                done.get().bookedSeats().forEach(s -> families.add(s.clientId()));
            } else {
                skipped++;
            }
        }
        for (LessonTime open : plan.holdOpen()) {
            if (cancels.holdOpen(ctx, open, now)) {
                openHeld++;
                continue;
            }
            // Booked since it was read: Cancel rest of week holds that lesson too (S8).
            Optional<CoachCancelPlan.Cancel> fresh = reread(ctx, open, AfterCancel.HOLD, now);
            Optional<CoachCancelPlan.Cancel> done = fresh.flatMap(c -> write(ctx, batch, c, now));
            if (done.isPresent()) {
                cancelled++;
                held++;
                done.get().bookedSeats().forEach(s -> families.add(s.clientId()));
            } else {
                skipped++;
            }
        }
        cancels.finish(ctx, batch.executed(cancelled, families.size()));
        return new Result(cancelled, held, openHeld, families.size(), skipped);
    }

    /** One lesson, read again and re-planned once if it changed since the plan. */
    private Optional<CoachCancelPlan.Cancel> cancelOne(AccessContext ctx, ChangeBatch batch, CoachCancelPlan.Cancel c, Instant now) {
        Optional<CoachCancelPlan.Cancel> done = write(ctx, batch, c, now);
        return done.isPresent() ? done : reread(ctx, c.time(), c.after(), now).flatMap(fresh -> write(ctx, batch, fresh, now));
    }

    /** The whole batch is this one lesson: header, lines and lesson time in one transaction. */
    private Optional<CoachCancelPlan.Cancel> writeAlone(AccessContext ctx, ChangeBatch done, CoachCancelPlan.Cancel c, Instant now) {
        ChangeBatch header = done.executed(1, (int) c.bookedSeats().stream().map(Seat::clientId).distinct().count());
        return cancels.cancelByCoach(ctx, header, c, lines(header, c, now), header, now) ? Optional.of(c) : Optional.empty();
    }

    private Optional<CoachCancelPlan.Cancel> write(AccessContext ctx, ChangeBatch batch, CoachCancelPlan.Cancel c, Instant now) {
        return cancels.cancelByCoach(ctx, batch, c, lines(batch, c, now), null, now) ? Optional.of(c) : Optional.empty();
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
