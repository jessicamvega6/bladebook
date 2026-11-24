package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import software.amazon.awssdk.services.sesv2.model.MessageRejectedException;

/**
 * Sends one email. On AWS this is SES's {@code SendEmail} with the stored template (Batch 17); locally it's
 * {@link LocalOutbox} (a listed shortcut, SC-21). Throws if the message wasn't accepted.
 */
@FunctionalInterface
public interface Mailer {

    void send(Email email);

    /**
     * A function with no sending address: its environment has no email domain yet (infra's {@code app-stack.ts}), so it
     * sends nothing, deliberately. Each email is refused as SES refuses a message, which is final (owner, 2026-11-17): the
     * guard is given back or the line marked {@code FAILED}, and the event or job still succeeds, so nothing is retried
     * or sent to a dead-letter queue.
     */
    static Mailer none(String function) {
        return email -> {
            throw MessageRejectedException.builder().message(function + " has no sending address; it sends no email").build();
        };
    }
}
