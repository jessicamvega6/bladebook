package com.bladebook.core.service;

import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;

import java.time.Instant;
import java.util.Optional;

/**
 * {@code sched-deadline-sweep} (ADR-MASTER sections 8 and 14): hourly, it reads GSI4 for every deadline due, re-checks each
 * record, acts, and removes the deadline.
 * <ul>
 *   <li>{@code EXPIRE}, on an invited seat: still {@code INVITED} once its lesson has started, it ends {@code EXPIRED} and
 *       the lesson goes ahead private.</li>
 * </ul>
 * Until 2026-11-23 it also cancelled a shared lesson whose staying family hadn't answered by the answer-by time
 * ({@code ANSWER}). The owner ruled that silence keeps the lesson at the full price, which the leave sets at once, so
 * nothing is due for that any more; an {@code ANSWER} deadline left on an older record is cleared like any other kind.
 * On AWS the Scheduler triggers it with the hour it's for; locally a timer or a local-only button does (a listed
 * shortcut). The pages never wait for it: they work out "expired" from the clock (B8).
 */
public final class DeadlineSweepService {

    /** What one run did. */
    public record Swept(int expired, int cleared) {
    }

    private final ShareRepository shares;
    private final SeatEvents events;

    public DeadlineSweepService(ShareRepository shares, SeatEvents events) {
        this.shares = shares;
        this.events = events;
    }

    /** @param at the moment the run is for (the Scheduler's time, never the clock read inside the job) */
    public Swept sweep(Instant at) {
        int expired = 0, cleared = 0;
        for (ShareRepository.Due d : shares.due(at)) {
            if ("EXPIRE".equals(d.kind())) {
                Optional<Seat> seat = shares.seatAt(d.coachId(), d.itemKey());
                if (seat.isPresent() && seat.get().seatStatus() == Seat.Status.INVITED && Sharing.expired(seat.get().startsAtUtc(), at)) {
                    if (shares.expire(seat.get(), at)) {
                        expired++;
                        events.seatsChanged(d.coachId(), seat.get().lessonDate(), seat.get().startTime());
                    }
                } else {
                    shares.clearDeadline(d.coachId(), d.itemKey());
                    cleared++;
                }
            } else {
                shares.clearDeadline(d.coachId(), d.itemKey());
                cleared++;
            }
        }
        return new Swept(expired, cleared);
    }
}
