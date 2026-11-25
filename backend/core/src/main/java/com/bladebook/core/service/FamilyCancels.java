package com.bladebook.core.service;

import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.Notice;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.UUID;

/**
 * A family's cancel of one of its own booked seats, shared or not (ADR-MASTER sections 8 and 10): the one rule behind My
 * bookings' Cancel, a series change and the staying family's "Cancel, no charge". The lesson time decides what the cancel
 * does ({@link Sharing#leave}); nobody's seat but the family's own is read.
 */
final class FamilyCancels {

    /**
     * What one cancel did. {@code done}: written; {@code late}: inside the notice period; {@code leave}: what it did to the
     * lesson; {@code withdrawn}: the invitation it withdrew, or null.
     */
    record Done(boolean done, boolean late, Sharing.Leave leave, String withdrawn) {

        Done(boolean done, boolean late, Sharing.Leave leave) {
            this(done, late, leave, null);
        }
    }

    private final CancellationRepository cancels;
    private final SeatEvents events;

    FamilyCancels(CancellationRepository cancels, SeatEvents events) {
        this.cancels = cancels;
        this.events = events;
    }

    /**
     * @param header put with the seat when the batch is this one lesson; {@code null} when the caller writes the batch's
     *               header itself
     */
    Done cancel(ClientContext ctx, LinkedSkater skater, Seat seat, AvailableTime time, ChangeBatch batch, ChangeBatch header, Instant now) {
        boolean late = Notice.isLate(seat.startsAtUtc(), time.requiredNoticeHours(), now);
        Sharing.Leave leave = Sharing.leave(Math.max(1, time.seatsTaken()), time.shareCount(), late);
        ShareRepository.PendingLeave pending = null;
        if (leave == Sharing.Leave.IN_TIME) {
            String staying = time.joinOrder().stream().filter(id -> !id.equals(seat.studentId())).findFirst().orElse(null);
            if (staying == null) {
                return new Done(false, late, leave);
            }
            pending = new ShareRepository.PendingLeave(UUID.randomUUID().toString(), seat.studentId(), seat.studentName(), now, staying,
                    Sharing.answerBy(seat.startsAtUtc(), time.requiredNoticeHours(), now));
        }
        CancellationLine line = CancellationLine.of(batch, seat, time.shareFor(seat.studentId()), time.currency(), now);
        boolean done = cancels.cancelOwn(ctx, skater, header, seat, line, leave, pending, now);
        if (done && leave != Sharing.Leave.RELEASE) {
            events.seatsChanged(skater.coachId(), seat.lessonDate(), seat.startTime());
        }
        return new Done(done, late, leave, done && leave == Sharing.Leave.WITHDRAW ? seat.share().inviteId() : null);
    }

    /**
     * After every date of one action: one marker per invitation it withdrew, so the invited family gets one email for all
     * of them (owner, 2026-11-25).
     */
    void markWithdrawn(ClientContext ctx, LinkedSkater skater, Collection<String> inviteIds, Instant now) {
        for (String inviteId : new LinkedHashSet<>(inviteIds)) {
            cancels.markWithdrawn(ctx, skater, inviteId, now);
        }
    }
}
