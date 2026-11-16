package com.bladebook.core.service;

import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A family cancels one lesson from My bookings (ADR-MASTER section 10, "By the family";
 * FeatureDecriptions/cancelation.md, Client cancelation). The seat moves to a {@code CANCELLED#} line, in one transaction
 * with a change-batch header of one. Nothing is charged in MVP.
 *
 * <p>A shared lesson (Batch 11; ADR-MASTER section 8): with an invitation still unanswered, the cancel withdraws it and
 * the time is released; with the other skater joined, the cancel is a leave, in time (the other family is asked to keep
 * or cancel) or late (they keep their share). The time goes back on the coach's calendar only when its last skater goes.
 *
 * <p>Asking again for a lesson that's already gone answers {@code ALREADY_CANCELLED} and writes nothing, so a retry
 * after a lost reply is safe.
 */
public final class CancellationService {

    public enum Outcome { CANCELLED, ALREADY_CANCELLED }

    /**
     * {@code late}: inside the lesson's notice period, when the coach is told (the notification batch sends it).
     * {@code leave}: what the cancel did to a shared lesson, or {@code RELEASE} when nobody else was in it.
     */
    public record FamilyCancel(Outcome outcome, boolean late, String coachFirstName, String studentName, LocalDate date,
                               LocalTime startTime, Sharing.Leave leave) {
    }

    /** The staying family's "Cancel, no charge" on several dates: which were cancelled, which had gone or been answered. */
    public record Answered(List<LocalDate> done, List<LocalDate> skipped) {
    }

    static final String STARTED = "This lesson has already started, so it can’t be cancelled.";
    static final String MARKED = "Coach %s has already marked this lesson, so it can’t be cancelled.";
    static final String CHANGED = "This lesson changed while you were cancelling. Reload the page and try again.";

    private final ClientLinks links;
    private final BookingRepository bookings;
    private final CancellationRepository cancels;
    private final FamilyCancels one;
    private final Clock clock;

    public CancellationService(ClientLinks links, BookingRepository bookings, CancellationRepository cancels, Clock clock) {
        this(links, bookings, cancels, clock, SeatEvents.NONE);
    }

    public CancellationService(ClientLinks links, BookingRepository bookings, CancellationRepository cancels, Clock clock, SeatEvents events) {
        this.links = links;
        this.bookings = bookings;
        this.cancels = cancels;
        this.one = new FamilyCancels(cancels, events);
        this.clock = clock;
    }

    public FamilyCancel cancel(ClientContext ctx, String coachId, String studentId, LocalDate date, LocalTime start) {
        LinkedSkater skater = links.requireActive(ctx, coachId, studentId, "cancel");
        // One retry: a booking or cancel by someone else on a shared time can change the lesson time between read and write.
        for (int attempt = 0; attempt < 2; attempt++) {
            Instant now = clock.instant();
            Optional<Seat> found = cancels.ownSeat(ctx, skater, date, start);
            if (found.isEmpty()) {
                return new FamilyCancel(Outcome.ALREADY_CANCELLED, false, skater.coachFirstName(), skater.studentName(), date, start,
                        Sharing.Leave.RELEASE);
            }
            Seat seat = check(found.get(), skater, now);
            AvailableTime time = time(ctx, skater, date, start);
            ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT,
                    ctx.clientId(), date, date, 1, 1, ChangeBatch.Execution.EXECUTED);
            FamilyCancels.Done d = one.cancel(ctx, skater, seat, time, batch, batch, now);
            if (d.done()) {
                return new FamilyCancel(Outcome.CANCELLED, d.late(), skater.coachFirstName(), skater.studentName(), date, start, d.leave());
            }
        }
        throw DomainException.conflict(CHANGED);
    }

    /**
     * The staying family's "Cancel, no charge" for one date or all remaining dates (ADR-MASTER section 8, "The staying
     * family's card"): one change batch, each date in its own transaction, re-checked first. A date that started, was
     * answered or was cancelled meanwhile is skipped and reported.
     */
    public Answered cancelWaiting(ClientContext ctx, String coachId, String studentId, List<LocalDate> dates, LocalTime start) {
        LinkedSkater skater = links.requireActive(ctx, coachId, studentId, "cancel");
        Instant now = clock.instant();
        List<Seat> waiting = new ArrayList<>();
        List<LocalDate> skipped = new ArrayList<>();
        for (LocalDate d : dates.stream().distinct().sorted().toList()) {
            Optional<Seat> s = cancels.ownSeat(ctx, skater, d, start);
            if (s.isPresent() && s.get().seatStatus() == Seat.Status.BOOKED && !s.get().hasStarted(now)
                    && s.get().share().choiceAnswerBy() != null && !Sharing.noAnswer(s.get().share().choiceAnswerBy(), now)) {
                waiting.add(s.get());
            } else {
                skipped.add(d);
            }
        }
        List<LocalDate> done = new ArrayList<>();
        if (!waiting.isEmpty()) {
            ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT,
                    ctx.clientId(), waiting.get(0).lessonDate(), waiting.get(waiting.size() - 1).lessonDate(), waiting.size(), 1,
                    ChangeBatch.Execution.PLANNED);
            cancels.startForFamily(ctx, skater, batch);
            for (Seat s : waiting) {
                AvailableTime t = bookings.timesAt(ctx, skater.coach(), List.of(LessonTime.key(s.lessonDate(), s.startTime())))
                        .get(LessonTime.key(s.lessonDate(), s.startTime()));
                if (t != null && one.cancel(ctx, skater, s, t, batch, null, now).done()) {
                    done.add(s.lessonDate());
                } else {
                    skipped.add(s.lessonDate());
                }
            }
            cancels.finishForFamily(ctx, skater, batch.executed(done.size(), done.isEmpty() ? 0 : 1));
        }
        return new Answered(done, skipped.stream().sorted().toList());
    }

    private Seat check(Seat seat, LinkedSkater skater, Instant now) {
        if (seat.hasStarted(now)) {
            throw DomainException.conflict(STARTED);
        }
        if (seat.seatStatus() != Seat.Status.BOOKED) {
            throw DomainException.conflict(String.format(MARKED, skater.coachFirstName()));
        }
        return seat;
    }

    private AvailableTime time(ClientContext ctx, LinkedSkater skater, LocalDate date, LocalTime start) {
        AvailableTime time = bookings.timesAt(ctx, skater.coach(), List.of(LessonTime.key(date, start))).get(LessonTime.key(date, start));
        if (time == null) {
            throw DomainException.conflict(CHANGED);
        }
        return time;
    }
}
