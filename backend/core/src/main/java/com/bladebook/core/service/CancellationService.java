package com.bladebook.core.service;

import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Notice;
import com.bladebook.core.domain.Seat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A family cancels one lesson from My bookings (ADR-MASTER section 10, "By the family";
 * FeatureDecriptions/cancelation.md, Client cancelation). The seat moves to a {@code CANCELLED#} line and the time
 * goes back on the coach's calendar, in one transaction with a change-batch header of one. Nothing is charged in MVP.
 *
 * <p>Asking again for a lesson that's already gone answers {@code ALREADY_CANCELLED} and writes nothing, so a retry
 * after a lost reply is safe.
 */
public final class CancellationService {

    public enum Outcome { CANCELLED, ALREADY_CANCELLED }

    /** {@code late}: inside the lesson's notice period, when the coach is told (the notification batch sends it). */
    public record FamilyCancel(Outcome outcome, boolean late, String coachFirstName, String studentName, LocalDate date,
                               LocalTime startTime) {
    }

    static final String STARTED = "This lesson has already started, so it can’t be cancelled.";
    static final String MARKED = "Coach %s has already marked this lesson, so it can’t be cancelled.";
    static final String CHANGED = "This lesson changed while you were cancelling. Reload the page and try again.";

    private final ClientLinks links;
    private final BookingRepository bookings;
    private final CancellationRepository cancels;
    private final Clock clock;

    public CancellationService(ClientLinks links, BookingRepository bookings, CancellationRepository cancels, Clock clock) {
        this.links = links;
        this.bookings = bookings;
        this.cancels = cancels;
        this.clock = clock;
    }

    public FamilyCancel cancel(ClientContext ctx, String coachId, String studentId, LocalDate date, LocalTime start) {
        LinkedSkater skater = links.requireActive(ctx, coachId, studentId, "cancel");
        // One retry: a booking or cancel by someone else on a shared time can change the lesson time between read and write.
        for (int attempt = 0; attempt < 2; attempt++) {
            Instant now = clock.instant();
            Optional<Seat> found = cancels.ownSeat(ctx, skater, date, start);
            if (found.isEmpty()) {
                return new FamilyCancel(Outcome.ALREADY_CANCELLED, false, skater.coachFirstName(), skater.studentName(), date, start);
            }
            Seat seat = found.get();
            if (seat.hasStarted(now)) {
                throw DomainException.conflict(STARTED);
            }
            if (seat.seatStatus() != Seat.Status.BOOKED) {
                throw DomainException.conflict(String.format(MARKED, skater.coachFirstName()));
            }
            AvailableTime time = bookings.timesAt(ctx, skater.coach(), List.of(LessonTime.key(date, start))).get(LessonTime.key(date, start));
            if (time == null) {
                throw DomainException.conflict(CHANGED);
            }
            ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT,
                    ctx.clientId(), date, date, 1, 1, ChangeBatch.Execution.EXECUTED);
            CancellationLine line = CancellationLine.of(batch, seat, time.shareFor(studentId), time.currency(), now);
            if (cancels.cancelByFamily(ctx, skater, batch, seat, line, now)) {
                return new FamilyCancel(Outcome.CANCELLED, Notice.isLate(seat.startsAtUtc(), time.requiredNoticeHours(), now),
                        skater.coachFirstName(), skater.studentName(), date, start);
            }
        }
        throw DomainException.conflict(CHANGED);
    }
}
