package com.bladebook.core.domain;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The waiting gate (ADR-MASTER section 5, "What a waiting family sees"; section 16, {@code linkStatus}).
 *
 * <ul>
 *   <li>A family's standing with a coach is {@code ACTIVE} once that coach has approved <b>any</b> of
 *       its skaters, otherwise {@code PENDING}.</li>
 *   <li>A family is <b>waiting</b> while it is ACTIVE with no coach. A waiting family sees only Home
 *       and Profile, and nothing of any coach beyond the name.</li>
 * </ul>
 */
public final class FamilyStanding {

    private final List<SkaterLink> links;

    private FamilyStanding(List<SkaterLink> links) {
        this.links = List.copyOf(links);
    }

    public static FamilyStanding of(List<SkaterLink> links) {
        return new FamilyStanding(links);
    }

    public boolean waiting() {
        return links.stream().noneMatch(l -> l.status() == StudentStatus.ACTIVE);
    }

    /** The family's standing with one coach, or empty when none of its skaters is with that coach. */
    public Optional<StudentStatus> statusWith(String coachId) {
        List<SkaterLink> with = links.stream().filter(l -> l.coachId().equals(coachId)).toList();
        if (with.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(with.stream().anyMatch(l -> l.status() == StudentStatus.ACTIVE)
                ? StudentStatus.ACTIVE : StudentStatus.PENDING);
    }

    /** Every coach any skater is with or waiting for, in the order first seen. */
    public List<String> coachIds() {
        Set<String> ids = new LinkedHashSet<>();
        links.forEach(l -> ids.add(l.coachId()));
        return new ArrayList<>(ids);
    }

    /** The family's skaters still waiting for this coach. */
    public List<SkaterLink> waitingWith(String coachId) {
        return links.stream()
                .filter(l -> l.coachId().equals(coachId) && l.status() == StudentStatus.PENDING)
                .toList();
    }
}
