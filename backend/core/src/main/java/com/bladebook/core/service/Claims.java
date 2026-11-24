package com.bladebook.core.service;

import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.domain.Email;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * One email's guards (ADR-MASTER section 19; {@code docs/tla/EmailGuard.tla}): each claimed {@code PENDING}, given the
 * sent value once SES has taken the email, and given back if it didn't. A guard another run is still sending under is
 * remembered, so the run fails at the end and is retried once this email's own claims are settled.
 */
final class Claims {

    private final NotifyRepository repo;
    private final Instant now;
    private final Duration abandonedAfter;
    private final List<NotifyRepository.Guard> mine = new ArrayList<>();
    private boolean inProgress;

    Claims(NotifyRepository repo, Instant now, Duration abandonedAfter) {
        this.repo = repo;
        this.now = now;
        this.abandonedAfter = abandonedAfter;
    }

    /** Claims a once-only guard; {@code true} if this email now holds it. */
    boolean once(String pk, String sk, String attr) {
        return take(NotifyRepository.once(pk, sk, attr, now));
    }

    /** Claims a dated guard for {@code value}; {@code true} if this email now holds it. */
    boolean dated(String pk, String sk, String attr, String value) {
        return take(NotifyRepository.dated(pk, sk, attr, value, now));
    }

    /** Claims a guard built elsewhere ({@link NotifyRepository#leaveEmail}). */
    boolean take(NotifyRepository.Guard g) {
        switch (repo.claim(g, now, abandonedAfter)) {
            case CLAIMED:
                mine.add(g);
                return true;
            case IN_PROGRESS:
                inProgress = true;
                return false;
            default:
                return false;
        }
    }

    boolean none() {
        return mine.isEmpty();
    }

    /** Sends under these claims: marked sent if SES took it, given back if not ({@link Sending#send}). */
    boolean send(Mailer mailer, Email email) {
        return send(mailer, email, false);
    }

    /** {@code keepOnRefusal}: SES's refusal (final) marks the guards done rather than giving them back. */
    boolean send(Mailer mailer, Email email, boolean keepOnRefusal) {
        boolean sent = Sending.send(mailer, email, keepOnRefusal ? this::confirm : this::release, this::release);
        if (sent) {
            confirm();
        }
        return sent;
    }

    /** Nobody to send it to: the guards are marked done, so no run claims them again. */
    void confirm() {
        mine.forEach(repo::confirm);
    }

    void release() {
        mine.forEach(repo::release);
    }

    /** Fails the run if a guard was held by another run still sending, so it's retried once that one is settled. */
    void throwIfInProgress(String template) {
        if (inProgress) {
            throw new EmailNotAccepted(template, new IllegalStateException("another run is sending it"));
        }
    }
}
