package com.bladebook.core.service;

import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * {@code sched-deadline-sweep} (ADR-MASTER sections 8 and 14): hourly, it reads GSI4 for every deadline due, re-checks each
 * record, acts, and removes the deadline.
 * <ul>
 *   <li>{@code EXPIRE}, on an invited seat: still {@code INVITED} once its lesson has started, it ends {@code EXPIRED} and
 *       the lesson goes ahead private.</li>
 *   <li>{@code ANSWER}, on a lesson time: the staying family hasn't answered by the answer-by time, so their seat is
 *       cancelled with no charge through a change batch, {@code cancelledBy = NO_ANSWER}.</li>
 * </ul>
 * On AWS the Scheduler triggers it with the hour it's for; locally a timer or a local-only button does (a listed
 * shortcut). The pages never wait for it: they work out "expired" and "cancelled, no answer" from the clock (B8).
 */
public final class DeadlineSweepService {

    /** What one run did. */
    public record Swept(int expired, int cancelledNoAnswer, int cleared) {
    }

    private final ShareRepository shares;
    private final SeatEvents events;

    public DeadlineSweepService(ShareRepository shares, SeatEvents events) {
        this.shares = shares;
        this.events = events;
    }

    /** @param at the moment the run is for (the Scheduler's time, never the clock read inside the job) */
    public Swept sweep(Instant at) {
        int expired = 0, noAnswer = 0, cleared = 0;
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
            } else if ("ANSWER".equals(d.kind())) {
                String[] k = d.itemKey().split("#"); // LESSON#<date>#<startTime>
                LocalDate date = LocalDate.parse(k[1]);
                LocalTime start = LocalTime.parse(k[2]);
                Optional<ShareRepository.PendingLeave> pending = shares.pendingLeave(d.coachId(), date, start);
                if (pending.isEmpty() || !Sharing.noAnswer(pending.get().answerBy(), at)) {
                    if (pending.isEmpty()) {
                        shares.clearDeadline(d.coachId(), d.itemKey());
                        cleared++;
                    }
                    continue;
                }
                if (cancelNoAnswer(d.coachId(), pending.get(), date, start, at)) {
                    noAnswer++;
                }
            } else {
                shares.clearDeadline(d.coachId(), d.itemKey());
                cleared++;
            }
        }
        return new Swept(expired, noAnswer, cleared);
    }

    private boolean cancelNoAnswer(String coachId, ShareRepository.PendingLeave pending, LocalDate date, LocalTime start, Instant at) {
        Optional<Seat> staying = shares.seatAt(coachId, Seat.key(date, start, pending.stayingStudentId()));
        Optional<LessonTime> time = shares.lessonAt(coachId, date, start);
        if (staying.isEmpty() || time.isEmpty()) {
            return shares.cancelNoAnswer(coachId, pending, null, null, null, date, start, at);
        }
        Seat s = staying.get();
        ChangeBatch batch = new ChangeBatch(UUID.randomUUID().toString(), at, ChangeBatch.Source.LESSON, ChangeBatch.By.NO_ANSWER,
                "SWEEP", date, date, 1, 1, ChangeBatch.Execution.EXECUTED)
                .withNotes(java.util.Map.of("otherSkater", pending.leftStudentName(), "answerBy", pending.answerBy().toString()));
        LessonTime t = time.get();
        int share = t.shareFor(t.priceMinor(), s.studentId(), List.of(s.studentId()));
        CancellationLine line = CancellationLine.of(batch, s, share, t.currency(), at);
        return shares.cancelNoAnswer(coachId, pending, s, batch, line, date, start, at);
    }
}
