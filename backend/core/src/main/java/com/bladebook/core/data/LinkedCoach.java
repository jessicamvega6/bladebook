package com.bladebook.core.data;

import com.bladebook.core.domain.StudentStatus;

/**
 * A coach a family is linked to, with the family's standing ({@code linkStatus}) with them (ADR-MASTER
 * section 16). Only {@code core.data} makes one, from the family's own link items, so a coach ID typed
 * into a request can never stand in for one. On AWS it carries the second {@code client-tenant}
 * session's tags.
 */
public final class LinkedCoach {

    private final String coachId;
    private final StudentStatus status;

    LinkedCoach(String coachId, StudentStatus status) {
        this.coachId = coachId;
        this.status = status;
    }

    public String coachId() {
        return coachId;
    }

    /** {@code linkStatus = ACTIVE}: the coach has approved at least one of the family's skaters. */
    public boolean active() {
        return status == StudentStatus.ACTIVE;
    }
}
