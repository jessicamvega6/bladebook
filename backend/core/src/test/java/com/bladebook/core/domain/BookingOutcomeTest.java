package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A date whose booking transaction failed is attributed by reading the family's own seat key for that skater
 * (ADR-031 decision 4; ADR-MASTER section 7, "Booking a time").
 */
class BookingOutcomeTest {

    @Test
    void theSeatCarriesThisRequestsKeySoARetryFoundItsOwnWrite() {
        assertThat(BookingOutcome.afterFailure(true, "key-1", "key-1")).isEqualTo(BookingOutcome.BOOKED);
    }

    @Test
    void theSeatIsFromAnotherRequestSoItWasAlreadyBooked() {
        assertThat(BookingOutcome.afterFailure(true, "key-0", "key-1")).isEqualTo(BookingOutcome.ALREADY_BOOKED);
    }

    @Test
    void aSeatWithNoKeyIsFromAnotherRequest() {
        assertThat(BookingOutcome.afterFailure(true, null, "key-1")).isEqualTo(BookingOutcome.ALREADY_BOOKED);
    }

    @Test
    void noSeatMeansUnavailableWhateverTheCause() {
        assertThat(BookingOutcome.afterFailure(false, null, "key-1")).isEqualTo(BookingOutcome.UNAVAILABLE);
    }

    @Test
    void theOneMessageForEveryDateThatCouldntBeBooked() {
        // B1 (owner, 2026-11-08; wording 2026-11-09): taken and no longer exists are one answer.
        assertThat(BookingOutcome.UNAVAILABLE_MESSAGE).isEqualTo("That time was taken or no longer exists.");
    }
}
