package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The waiting gate (ADR-MASTER section 5, "What a waiting family sees"): a family is waiting while no
 * skater is ACTIVE with any coach, and its standing with each coach is ACTIVE once that coach has
 * approved any of its skaters.
 */
class FamilyStandingTest {

    private static SkaterLink link(String coach, String student, StudentStatus status) {
        return new SkaterLink(coach, student, "Skater " + student, status, "Coach", coach);
    }

    @Test
    void aFamilyWithEverySkaterPendingIsWaiting() {
        FamilyStanding s = FamilyStanding.of(List.of(
                link("dana", "ava", StudentStatus.PENDING),
                link("dana", "jack", StudentStatus.PENDING)));

        assertThat(s.waiting()).isTrue();
        assertThat(s.statusWith("dana")).contains(StudentStatus.PENDING);
    }

    @Test
    void oneApprovedSkaterWithOneCoachEndsTheWait() {
        FamilyStanding s = FamilyStanding.of(List.of(
                link("dana", "ava", StudentStatus.ACTIVE),
                link("dana", "jack", StudentStatus.PENDING),
                link("ben", "jack", StudentStatus.PENDING)));

        assertThat(s.waiting()).isFalse();
        assertThat(s.statusWith("dana")).contains(StudentStatus.ACTIVE);
        assertThat(s.statusWith("ben")).contains(StudentStatus.PENDING);
    }

    @Test
    void aCoachTheFamilyHasNoLinkWithHasNoStanding() {
        assertThat(FamilyStanding.of(List.of(link("dana", "ava", StudentStatus.ACTIVE))).statusWith("ben")).isEmpty();
    }

    @Test
    void aFamilyWithNoLinksIsWaiting() {
        // A skater with no coach yet (ADR-025, 2026-11-06) can't be booked, so nothing opens.
        assertThat(FamilyStanding.of(List.of()).waiting()).isTrue();
    }

    @Test
    void coachesAreListedOnceInTheOrderFirstSeen() {
        FamilyStanding s = FamilyStanding.of(List.of(
                link("dana", "ava", StudentStatus.PENDING),
                link("ben", "ava", StudentStatus.PENDING),
                link("dana", "jack", StudentStatus.PENDING)));

        assertThat(s.coachIds()).containsExactly("dana", "ben");
        assertThat(s.waitingWith("dana")).extracting(SkaterLink::studentId).containsExactly("ava", "jack");
    }
}
