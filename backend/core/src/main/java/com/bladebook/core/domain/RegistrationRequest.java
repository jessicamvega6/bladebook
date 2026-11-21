package com.bladebook.core.domain;

import java.util.List;

/**
 * A family's sign-up as the website sends it, before any checks (ADR-MASTER section 5). Coach codes, not
 * coach IDs: the server resolves every code again (step 3), never trusting IDs from the browser. The
 * login email isn't here; it comes from the token.
 *
 * @param relationship {@code SELF} or {@code GUARDIAN}
 * @param coachCodes   every code entered on step 1
 */
public record RegistrationRequest(String firstName, String lastName, String phone, String relationship,
                                  List<String> coachCodes, List<SkaterRequest> skaters) {

    /**
     * One skater. For {@code SELF} the name is ignored: the skater is the account holder.
     *
     * @param coachCodes which of the sign-up's coaches this skater joins
     */
    public record SkaterRequest(String name, String skatingOrg, String registrationNumber, List<String> coachCodes) {
    }
}
