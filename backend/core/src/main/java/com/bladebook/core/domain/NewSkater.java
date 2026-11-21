package com.bladebook.core.domain;

import java.util.List;

/** One skater from a checked sign-up, and the coaches they join. */
public record NewSkater(String name, boolean isMinor, SkatingOrg skatingOrg, String registrationNumber,
                        List<CoachCode> coachCodes) {

    public NewSkater {
        coachCodes = List.copyOf(coachCodes);
    }
}
