package com.bladebook.core.service;

import com.bladebook.core.domain.Email;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.logging.Logger;

/**
 * <b>Local profile only; a listed shortcut (SC-21).</b> Keeps the last {@value #KEEP} emails in memory instead of sending
 * them, for the local-only outbox route, and logs each one's template name (never the address or the content, which hold
 * personal details). Nothing reaches a real inbox.
 */
public final class LocalOutbox implements Mailer {

    /** One kept email and when it was "sent". */
    public record Sent(Instant at, Email email) {
    }

    static final int KEEP = 500;
    private static final Logger LOG = Logger.getLogger(LocalOutbox.class.getName());

    private final Deque<Sent> sent = new ArrayDeque<>();
    private final Clock clock;

    public LocalOutbox(Clock clock) {
        this.clock = clock;
    }

    @Override
    public synchronized void send(Email email) {
        sent.addLast(new Sent(clock.instant(), email));
        while (sent.size() > KEEP) {
            sent.removeFirst();
        }
        LOG.info(() -> "email (local outbox): " + email.template());
    }

    /** Newest first. */
    public synchronized List<Sent> list() {
        List<Sent> out = new ArrayList<>(sent);
        Collections.reverse(out);
        return out;
    }

    public synchronized void clear() {
        sent.clear();
    }
}
