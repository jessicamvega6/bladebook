package com.bladebook.core.domain;

import java.util.List;

/** A sign-up that passed {@link RegistrationRules}: cleaned names, parsed codes, cleaned numbers. */
public record Registration(String firstName, String lastName, String phone, ClientRelationship relationship,
                           List<CoachCode> coachCodes, List<NewSkater> skaters) {

    public Registration {
        coachCodes = List.copyOf(coachCodes);
        skaters = List.copyOf(skaters);
    }
}
