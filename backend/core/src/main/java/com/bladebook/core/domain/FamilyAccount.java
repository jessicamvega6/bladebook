package com.bladebook.core.domain;

import java.util.List;

/** Everything in a family's own partition that Home and Profile show. */
public record FamilyAccount(FamilyProfile profile, List<Skater> skaters, List<SkaterLink> links) {

    public FamilyAccount {
        skaters = List.copyOf(skaters);
        links = List.copyOf(links);
    }

    public FamilyStanding standing() {
        return FamilyStanding.of(links);
    }
}
