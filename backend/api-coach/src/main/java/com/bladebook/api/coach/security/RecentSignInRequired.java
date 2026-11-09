package com.bladebook.api.coach.security;

/**
 * Saving a schedule needs a sign-in from the last 15 minutes (ADR-MASTER section 15). The website asks
 * for the password and retries the save, keeping the coach's edits.
 */
public final class RecentSignInRequired extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public RecentSignInRequired() {
        super("Enter your password again to save your schedule.");
    }
}
