package com.bladebook.core.service;

import com.bladebook.core.domain.Email;

/**
 * Sends one email. On AWS this is SES's {@code SendEmail} with the stored template (Batch 17); locally it's
 * {@link LocalOutbox} (a listed shortcut, SC-21). Throws if the message wasn't accepted.
 */
@FunctionalInterface
public interface Mailer {

    void send(Email email);
}
