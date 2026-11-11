package com.bladebook.core.domain;

/** What a coach code reveals about its coach: the name only (ADR-022 d7; A6, no rink or sport line). */
public record CoachName(String firstName, String lastName) {

    /** Initials for the avatar: photos are Phase 2 (A1). */
    public String initials() {
        return (firstName.isEmpty() ? "" : firstName.substring(0, 1)) + (lastName.isEmpty() ? "" : lastName.substring(0, 1));
    }
}
