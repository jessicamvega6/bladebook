package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sesv2.model.MessageRejectedException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Sending one email behind its guard (ADR-MASTER section 19): SES's refusal of the message is final; any other failure
 * gives the guard back and fails the run, after the run's other emails.
 */
class EmailNotAcceptedTest {

    private static final Email EMAIL = new Email("day-of-reminder", "sarah@example.com", "BladeBook", null, Map.of());

    private final List<String> done = new ArrayList<>();

    @Test
    void sesRefusingTheMessageIsFinalAndTheRunGoesOn() {
        Mailer refused = e -> {
            throw MessageRejectedException.builder().message("Email address is not verified.").build();
        };
        assertThat(Sending.send(refused, EMAIL, () -> done.add("marked failed"), () -> done.add("given back"))).isFalse();
        assertThat(done).containsExactly("marked failed");
    }

    @Test
    void anyOtherFailureGivesTheGuardBackAndThrows() {
        Mailer down = e -> {
            throw new IllegalStateException("SES is unavailable");
        };
        assertThatThrownBy(() -> Sending.send(down, EMAIL, () -> done.add("marked failed"), () -> done.add("given back")))
                .isInstanceOf(EmailNotAccepted.class).hasMessage("email not accepted: day-of-reminder")
                .hasCauseInstanceOf(IllegalStateException.class);
        assertThat(done).containsExactly("given back");
    }

    @Test
    void aRunThrowsOnceAtTheEndCountingEveryEmailNotAccepted() {
        Sending.Unsent unsent = new Sending.Unsent();
        assertThat(unsent.of(() -> 1)).isEqualTo(1);
        unsent.throwIfAny(); // nothing yet
        assertThat(unsent.of(() -> {
            throw new EmailNotAccepted("day-of-reminder", new IllegalStateException("throttled"));
        })).isZero();
        assertThat(unsent.of(() -> {
            throw new EmailNotAccepted("coach-morning", new IllegalStateException("throttled"));
        })).isZero();
        assertThatThrownBy(unsent::throwIfAny).isInstanceOfSatisfying(EmailNotAccepted.class, e -> assertThat(e.count()).isEqualTo(2))
                .hasMessageStartingWith("2 emails not accepted");
    }

    @Test
    void aFunctionWithNoSendingAddressSendsNothingAndDoesntFail() {
        assertThat(Sending.send(Mailer.none("bladebook-dev-sched-day-reminder"), EMAIL, () -> done.add("given back"))).isFalse();
        assertThat(done).containsExactly("given back");
    }
}
