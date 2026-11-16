package com.bladebook.core.service;

import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.StudentStatus;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

/**
 * Turns a share code typed while booking (or on a freed place) into the second skater (ADR-MASTER section 8, "Inviting";
 * ADR-033): another family's skater the coach has accepted, invited; or one of the family's own skaters the coach has
 * accepted, added directly. Anything else refuses the whole request, so nothing is booked (ADR-033 d2). The wording is the
 * share box's (FeatureDecriptions/Schedule lesson split; design {@code bkShareBox}).
 */
final class Partners {

    /** What the code turned out to be: {@code displayName} is what the family sees ("Ella A."). */
    record Resolved(BookingRepository.Partner partner, String displayName, boolean sibling) {
    }

    static final String WRONG = "That code doesn’t match a skater. Check it with the other family.";

    private final ClientLinks links;
    private final FamilyRepository families;
    private final ShareRepository shares;

    Partners(ClientLinks links, FamilyRepository families, ShareRepository shares) {
        this.links = links;
        this.families = families;
        this.shares = shares;
    }

    /**
     * @param host     the skater whose lesson it is
     * @param inviteId the invitation's ID, used when the code is another family's skater
     */
    Resolved resolve(ClientContext ctx, LinkedSkater host, String code, String inviteId) {
        ShareRepository.CodeMatch match = shares.shareCode(code)
                .orElseThrow(() -> DomainException.invalid("shareCode", WRONG));
        String hostFirst = first(host.studentName());
        if (match.studentId().equals(host.studentId())) {
            throw DomainException.invalid("shareCode", "That’s " + hostFirst + "’s own code. Enter the other skater’s code.");
        }
        FamilyAccount account = families.account(ctx).orElseThrow(() -> DomainException.notFound("Finish signing up first."));
        Optional<Skater> own = account.skaters().stream().filter(k -> k.studentId().equals(match.studentId())).findFirst();
        String coach = host.coachFirstName();
        if (own.isPresent()) {
            boolean active = account.links().stream().anyMatch(l -> l.coachId().equals(host.coachId())
                    && l.studentId().equals(match.studentId()) && l.status() == StudentStatus.ACTIVE);
            if (!active) {
                throw DomainException.conflict(first(own.get().name()) + " is not available to add until Coach " + coach + " accepts them.");
            }
            LinkedSkater sibling = links.requireActive(ctx, host.coachId(), match.studentId(), "share");
            return new Resolved(BookingRepository.Partner.sibling(sibling), match.displayName(), true);
        }
        Optional<StudentStatus> roster = shares.rosterStatus(ctx, host.coach(), match.studentId());
        if (roster.isEmpty() || roster.get() != StudentStatus.ACTIVE) {
            String f = first(match.displayName());
            throw DomainException.conflict(match.displayName() + " isn’t one of Coach " + coach + "’s students yet. " + f
                    + "’s family can sign up with Coach " + coach + "’s code, and once Coach " + coach + " accepts " + f
                    + " you can share a lesson.");
        }
        String byName = account.profile().fullName();
        return new Resolved(BookingRepository.Partner.invited(match.studentId(), match.displayName(), inviteId, byName),
                match.displayName(), false);
    }

    /** A series' invitation keeps one ID across a retry: it's derived from the request's key. */
    static String inviteIdFor(String idempotencyKey) {
        return UUID.nameUUIDFromBytes(("invite#" + idempotencyKey).getBytes(StandardCharsets.UTF_8)).toString();
    }

    private static String first(String name) {
        return name.trim().split("\\s+")[0];
    }
}
