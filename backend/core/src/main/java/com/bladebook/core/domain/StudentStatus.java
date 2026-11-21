package com.bladebook.core.domain;

/** A skater's status with one coach (ADR-MASTER section 3, {@code studentStatus}). */
public enum StudentStatus {
    /** Signed up with the coach's code; the coach hasn't approved them yet. Can't be booked. */
    PENDING,
    /** Approved by the coach. */
    ACTIVE;

    /** Reads a stored value. Anything else in the table is a data error, not a user's mistake. */
    public static StudentStatus parse(String stored) {
        for (StudentStatus s : values()) {
            if (s.name().equals(stored)) {
                return s;
            }
        }
        throw new IllegalStateException("unknown studentStatus");
    }
}
