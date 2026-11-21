package com.bladebook.core.domain;

import java.time.Instant;

/**
 * A family's profile, {@code CLIENT#<sub> / PROFILE} (ADR-MASTER section 3). The source of truth for the
 * family's contact details; each coach's {@code STUDENT#} record holds copies.
 *
 * @param clientId the Cognito {@code sub}
 * @param email    the login email, from the token
 */
public record FamilyProfile(String clientId, String firstName, String lastName, String email, String phone,
                            ClientRelationship relationship, Instant createdAt) {

    /** {@code clientName}: what coaches see. */
    public String fullName() {
        return firstName + " " + lastName;
    }
}
