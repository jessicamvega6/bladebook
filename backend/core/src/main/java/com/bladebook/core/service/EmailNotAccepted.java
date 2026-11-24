package com.bladebook.core.service;

/**
 * Emails SES didn't take for a reason that can pass (throttled, unreachable, a fault), each with its guard given back, so
 * the event or job fails and its retry sends them (ADR-MASTER section 19: EventBridge's retries, then the dead-letter
 * queue, which is replayed; the Scheduler's retries for a job). SES's own refusal of a message is not one of these: it is
 * final and never retried (owner, 2026-11-17).
 */
public final class EmailNotAccepted extends RuntimeException {

    private final int count;

    EmailNotAccepted(String template, Throwable cause) {
        super("email not accepted: " + template, cause);
        this.count = 1;
    }

    EmailNotAccepted(int count, EmailNotAccepted first) {
        super(count + (count == 1 ? " email" : " emails") + " not accepted (the first: " + first.getMessage()
                + "); the others were sent, and the retry sends only these", first.getCause());
        this.count = count;
    }

    /** How many emails weren't accepted. */
    public int count() {
        return count;
    }
}
