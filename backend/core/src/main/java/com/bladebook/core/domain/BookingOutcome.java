package com.bladebook.core.domain;

/**
 * What happened to one picked date (ADR-031 decision 4; ADR-006 d4b). A date whose transaction failed is
 * attributed by reading the family's own seat key for that skater, so another family's booking stays invisible.
 */
public enum BookingOutcome {

    /** Booked by this request, or by an earlier try of it (same idempotency key). */
    BOOKED,
    /** This skater already holds the time, from another request. Never booked twice. */
    ALREADY_BOOKED,
    /** Taken by someone else, or no longer exists: one answer on purpose (B1). */
    UNAVAILABLE;

    /** The one message for every date that couldn't be booked (B1, owner 2026-11-08; wording 2026-11-09). */
    public static final String UNAVAILABLE_MESSAGE = "That time was taken or no longer exists.";

    /**
     * @param seatExists whether the family's own seat for that skater and time exists
     * @param seatKey    the idempotency key the seat was written with, or {@code null}
     * @param requestKey this request's key
     */
    public static BookingOutcome afterFailure(boolean seatExists, String seatKey, String requestKey) {
        if (!seatExists) {
            return UNAVAILABLE;
        }
        return requestKey.equals(seatKey) ? BOOKED : ALREADY_BOOKED;
    }
}
