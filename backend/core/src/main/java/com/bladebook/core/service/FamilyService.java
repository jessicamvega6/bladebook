package com.bladebook.core.service;

import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LinkedCoach;
import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachPublicProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.FamilyStanding;
import com.bladebook.core.domain.ProfileRules;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.SkatingOrg;
import com.bladebook.core.domain.StudentStatus;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * A family's own account, as Home and Profile show it (ADR-MASTER section 5; FeatureDecriptions/ClientHomeView
 * and ClientProfileView). A coach's contact details and payment types are read only once that coach has
 * approved one of the family's skaters; a waiting family sees the coach's name and nothing else.
 */
public final class FamilyService {

    /** Everything Home and Profile need. {@code waiting}: no coach has approved any skater yet. */
    public record FamilyView(Contact contact, boolean waiting, List<SkaterView> skaters, List<CoachView> coaches) {
    }

    public record Contact(String firstName, String lastName, String email, String phone, ClientRelationship relationship) {
    }

    /** A skater, and their status with each coach they're with or waiting for. */
    public record SkaterView(String name, boolean isMinor, SkatingOrg skatingOrg, String registrationNumber,
                             List<CoachStatus> coaches) {
    }

    public record CoachStatus(String firstName, String lastName, StudentStatus status) {
    }

    /**
     * One coach, listed by name. {@code status} is the family's standing with them; {@code details} is null
     * unless it's {@code ACTIVE}.
     */
    public record CoachView(String firstName, String lastName, StudentStatus status, List<String> skaterNames,
                            List<String> waitingNames, CoachPublicProfile details) {
    }

    private final FamilyRepository families;

    public FamilyService(FamilyRepository families) {
        this.families = families;
    }

    /** @throws DomainException NOT_FOUND when the family hasn't finished signing up */
    public FamilyView view(ClientContext ctx) {
        FamilyAccount a = families.account(ctx).orElseThrow(() -> DomainException.notFound("Finish signing up first."));
        FamilyStanding standing = a.standing();

        List<SkaterView> skaters = new ArrayList<>();
        for (Skater k : a.skaters()) {
            List<CoachStatus> with = new ArrayList<>();
            for (SkaterLink l : a.links()) {
                if (l.studentId().equals(k.studentId())) {
                    with.add(new CoachStatus(l.coachFirstName(), l.coachLastName(), l.status()));
                }
            }
            skaters.add(new SkaterView(k.name(), k.isMinor(), k.skatingOrg(), k.registrationNumber(), with));
        }
        skaters.sort(Comparator.comparing(SkaterView::name, String.CASE_INSENSITIVE_ORDER));

        List<CoachView> coaches = new ArrayList<>();
        for (LinkedCoach coach : families.linkedCoaches(ctx)) {
            List<SkaterLink> with = a.links().stream().filter(l -> l.coachId().equals(coach.coachId()))
                    .sorted(Comparator.comparing(SkaterLink::studentName, String.CASE_INSENSITIVE_ORDER)).toList();
            SkaterLink any = with.get(0);
            Optional<CoachPublicProfile> details = families.coachProfile(ctx, coach);
            coaches.add(new CoachView(any.coachFirstName(), any.coachLastName(),
                    standing.statusWith(coach.coachId()).orElseThrow(),
                    with.stream().map(SkaterLink::studentName).toList(),
                    standing.waitingWith(coach.coachId()).stream().map(SkaterLink::studentName)
                            .sorted(String.CASE_INSENSITIVE_ORDER).toList(),
                    details.orElse(null)));
        }

        // Links are keyed by coach ID, which is random, so put coaches in a stable order: by name.
        coaches.sort(Comparator.comparing(CoachView::firstName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(CoachView::lastName, String.CASE_INSENSITIVE_ORDER));

        FamilyProfile p = a.profile();
        return new FamilyView(new Contact(p.firstName(), p.lastName(), p.email(), p.phone(), p.relationship()),
                standing.waiting(), skaters, coaches);
    }

    /** Name and mobile number. The change reaches each coach through consumer-family-sync. */
    public FamilyView updateContact(ClientContext ctx, String firstName, String lastName, String phone) {
        String first = ProfileRules.name("firstName", firstName);
        String last = ProfileRules.name("lastName", lastName);
        String ph = ProfileRules.phone(phone);
        if (ph == null) {
            throw DomainException.invalid("phone", "Enter a mobile phone number.");
        }
        families.updateContact(ctx, first, last, ph);
        return view(ctx);
    }
}
