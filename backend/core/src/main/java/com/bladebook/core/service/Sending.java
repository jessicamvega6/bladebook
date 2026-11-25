package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import software.amazon.awssdk.services.sesv2.model.MessageRejectedException;

import java.util.function.IntSupplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * How the consumers and the jobs send one email behind its guard (ADR-MASTER sections 13 and 19): SES's refusal of the
 * message ({@code MessageRejectedException}) is final, so the run carries on (owner, 2026-11-17); any other failure gives
 * the guard back and throws {@link EmailNotAccepted}, so the event or job fails and is retried.
 */
final class Sending {

    private static final Logger LOG = Logger.getLogger(Sending.class.getName());

    private Sending() {
    }

    /**
     * Sends. {@code true}: accepted. {@code false}: SES refused the message; {@code rejected} has run. Otherwise
     * {@code failed} runs (it gives the guard back) and this throws {@link EmailNotAccepted}.
     */
    static boolean send(Mailer mailer, Email email, Runnable rejected, Runnable failed) {
        try {
            mailer.send(email);
            return true;
        } catch (MessageRejectedException e) {
            // infra's email-refused alarm watches for this line (EMAIL_REFUSED_LINE in infra/lib/alarms.ts): keep them the same.
            LOG.log(Level.WARNING, "email refused by SES, not retried: " + email.template(), e);
            rejected.run();
            return false;
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "email not accepted, to be retried: " + email.template(), e);
            failed.run();
            throw new EmailNotAccepted(email.template(), e);
        }
    }

    /** {@link #send} with one {@code undo} for both: the guard is given back either way. */
    static boolean send(Mailer mailer, Email email, Runnable undo) {
        return send(mailer, email, undo, undo);
    }

    /**
     * The emails of one run that weren't accepted, so a run over many families sends to the others first and only then
     * fails (its retry finds the others' guards set and sends only these).
     */
    static final class Unsent {

        private int count;
        private EmailNotAccepted first;

        /** Runs one family's email(s); what it returns, or 0 if they weren't accepted. */
        int of(IntSupplier send) {
            try {
                return send.getAsInt();
            } catch (EmailNotAccepted e) {
                count += e.count();
                first = first == null ? e : first;
                return 0;
            }
        }

        /** Throws if any email of the run wasn't accepted. */
        void throwIfAny() {
            if (first != null) {
                throw new EmailNotAccepted(count, first);
            }
        }
    }
}
