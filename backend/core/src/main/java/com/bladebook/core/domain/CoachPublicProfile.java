package com.bladebook.core.domain;

/**
 * The coach-profile fields a family may read once the coach has approved one of its skaters
 * (ADR-MASTER section 4, "What families see"; section 16, the allowlist). Whether the phone and email
 * show is the coach's choice, so {@link #shownPhone()} and {@link #shownEmail()} apply it.
 */
public record CoachPublicProfile(String firstName, String lastName, String phone, String businessEmail,
                                 boolean displayPhoneToClients, boolean displayEmailToClients, PaymentTypes payments) {

    public String shownPhone() {
        return displayPhoneToClients ? phone : null;
    }

    public String shownEmail() {
        return displayEmailToClients ? businessEmail : null;
    }
}
