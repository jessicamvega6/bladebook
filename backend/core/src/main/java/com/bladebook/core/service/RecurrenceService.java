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
import com.bladebook.core.domain.Recurrence;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Weeks;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Changing a repeating booking (ADR-MASTER section 10, "By the family"; FeatureDecriptions/cancelation.md, Client
 * recurrence management): end it earlier, make it less frequent, or cancel all future lessons. Each only takes lessons
 * away, as one batch of cancellations; "future" excludes today's lesson. Nothing is charged in MVP; a lesson inside the
 * notice period makes it a late cancellation, and the coach is told (when emails exist).
 */
public final class RecurrenceService {

    /** What the change did. {@code late}: a cancelled lesson was inside its notice period. */
    public record Changed(int cancelled, boolean late, String coachFirstName, String studentName, Recurrence after) {
    }

    /** B4 (owner, 2026-11-09): the change page offers only "Cancel all future lessons" while the series is shared. */
    static final String SHARED = "This series is shared, so you can only cancel it here. Ending it earlier and making it less"
            + " frequent come back once no lesson still to come is shared.";

    private final ClientLinks links;
    private final BookingRepository bookings;
    private final CancellationRepository cancels;
    private final FamilyCancels one;
    private final Clock clock;

    public RecurrenceService(ClientLinks links, BookingRepository bookings, CancellationRepository cancels, Clock clock) {
        this(links, bookings, cancels, clock, SeatEvents.NONE);
    }

    public RecurrenceService(ClientLinks links, BookingRepository bookings, CancellationRepository cancels, Clock clock, SeatEvents events) {
        this.links = links;
        this.bookings = bookings;
        this.cancels = cancels;
        this.one = new FamilyCancels(cancels, events);
        this.clock = clock;
    }

    public Changed change(ClientContext ctx, String coachId, String recurrenceId, String change, String newEnd, Integer newInterval) {
        Recurrence.Change kind;
        try {
            kind = Recurrence.Change.valueOf(change == null ? "" : change);
        } catch (IllegalArgumentException e) {
            throw DomainException.invalid("change", "Choose how to change it.");
        }
        Recurrence r = bookings.recurrences().list(ctx).stream()
                .filter(x -> x.coachId().equals(coachId) && x.recurrenceId().equals(recurrenceId)).findFirst()
                .orElseThrow(() -> DomainException.noSuchItem("That repeating lesson couldn’t be found."));
        if (r.status() == Recurrence.Status.ENDED) {
            throw DomainException.conflict("That repeating lesson has ended.");
        }
        LinkedSkater skater = links.requireActive(ctx, coachId, r.studentId(), "cancel");
        String zone = bookings.coach(ctx, skater.coach()).orElseThrow(() -> DomainException.noSuchItem("That coach couldn’t be found.")).coachTimezone();
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZoneId.of(zone));
        List<Seat> future = bookings.familySeats(ctx, today.plusDays(1), Weeks.storeUntil(today)).stream()
                .filter(s -> recurrenceId.equals(s.recurrenceId()) && s.coachId().equals(coachId) && s.seatStatus() == Seat.Status.BOOKED
                        && s.startsAtUtc().isAfter(now))
                .sorted(Comparator.comparing(Seat::lessonDate)).toList();
        Map<String, AvailableTime> times = bookings.timesAt(ctx, skater.coach(),
                future.stream().map(s -> LessonTime.key(s.lessonDate(), s.startTime())).toList());
        // A series is shared while any lesson still to come has another skater, joined or invited (B4; ADR-031 d9).
        boolean shared = future.stream().map(s -> times.get(LessonTime.key(s.lessonDate(), s.startTime())))
                .anyMatch(t -> t != null && t.seatsTaken() >= 2);
        if (shared && kind != Recurrence.Change.STOP) {
            throw DomainException.conflict(SHARED);
        }
        LocalDate end = date(newEnd);
        List<LocalDate> cut = r.cancels(kind, end, newInterval, future.stream().map(Seat::lessonDate).toList(), today);
        List<Seat> going = future.stream().filter(s -> cut.contains(s.lessonDate())).toList();

        int done = 0;
        boolean late = false;
        if (!going.isEmpty()) {
            ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), now, ChangeBatch.Source.RECURRENCE, ChangeBatch.By.CLIENT,
                    ctx.clientId(), going.get(0).lessonDate(), going.get(going.size() - 1).lessonDate(), going.size(), 1,
                    ChangeBatch.Execution.PLANNED);
            cancels.startForFamily(ctx, skater, batch);
            for (Seat s : going) {
                AvailableTime t = times.get(LessonTime.key(s.lessonDate(), s.startTime()));
                if (t == null) {
                    continue;
                }
                // Each date follows the shared-lesson rules on its own: a withdrawn invitation, or a leave in time or late.
                FamilyCancels.Done d = one.cancel(ctx, skater, s, t, batch, null, now);
                if (d.done()) {
                    done++;
                    late |= d.late();
                }
            }
            cancels.finishForFamily(ctx, skater, batch.executed(done, done > 0 ? 1 : 0));
        }
        Recurrence after = r.after(kind, end, newInterval);
        bookings.recurrences().save(ctx, after);
        return new Changed(done, late, skater.coachFirstName(), skater.studentName(), after);
    }

    private static LocalDate date(String s) {
        try {
            return s == null || s.isBlank() ? null : LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            throw DomainException.invalid("endDate", "Pick a new last date.");
        }
    }
}
