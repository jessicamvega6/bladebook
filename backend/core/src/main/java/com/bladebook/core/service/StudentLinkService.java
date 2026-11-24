package com.bladebook.core.service;

import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;

import java.time.Clock;

/**
 * What {@code consumer-student-link} does with a {@code StudentChanged} event (ADR-MASTER sections 3 and 5):
 * the family's link item follows the coach's {@code STUDENT#} record. On AWS it runs from the stream;
 * locally it's called in-process after the write (a listed shortcut).
 *
 * <p>Not here yet: the approval email, which is Phase 2 (A10).
 */
public final class StudentLinkService {

    /** Sends the decline email; {@code giveBack} returns its claim if SES doesn't accept it. Whether it was sent. */
    @FunctionalInterface
    public interface DeclineEmail {
        boolean send(Runnable giveBack);
    }

    /** Another run is sending this decline's email: the event fails and its retry looks again. */
    public static final class DeclineEmailInProgress extends RuntimeException {
        DeclineEmailInProgress() {
            super("another run is sending this decline's email; retried");
        }
    }

    private final SyncRepository sync;
    private final Clock clock;

    public StudentLinkService(SyncRepository sync, Clock clock) {
        this.sync = sync;
        this.clock = clock;
    }

    public StudentLinkService(SyncRepository sync) {
        this(sync, Clock.systemUTC());
    }

    public void approved(StudentRecord after) {
        sync.setLinkStatus(after.clientId(), after.coachId(), after.studentId(), StudentStatus.ACTIVE);
    }

    /**
     * The record was removed: the family is emailed, then its link goes. The family's account and skater stay.
     *
     * <p>The link is the email's guard, so it goes last (TLA+ {@code docs/tla/StudentLink.tla}): the run claims the email
     * on it, sends, and only then deletes it. A send SES doesn't accept gives the claim back and fails the event with the
     * link still there, so the retry sends. A repeated event, or a retry after the send, finds the claim and sends nothing
     * more; a link the family has made again since is left alone. Lost only if a run stops between its claim and SES's
     * answer, as for every guard (ADR-MASTER section 19).
     *
     * @return whether this run sent the email
     * @throws DeclineEmailInProgress another run holds the claim
     */
    public boolean declined(StudentRecord before, DeclineEmail email) {
        String c = before.clientId(), coach = before.coachId(), s = before.studentId();
        return switch (sync.claimDeclineEmail(c, coach, s, before.signedUpAt(), clock.instant())) {
            case NOTHING -> false;
            case WAIT -> throw new DeclineEmailInProgress();
            case DELETE -> {
                sync.deleteLink(c, coach, s, before.signedUpAt());
                yield false;
            }
            case SEND -> {
                boolean sent = email.send(() -> sync.releaseDeclineEmail(c, coach, s, before.signedUpAt()));
                sync.deleteLink(c, coach, s, before.signedUpAt());
                yield sent;
            }
        };
    }
}
