package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The notifiers' guards and reads (ADR-MASTER section 19: every consumer has an idempotency guard). */
class NotifyRepositoryTest {

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    private final NotifyRepository repo = new NotifyRepository(f.clients, f.table);

    private void put(String pk, String sk) {
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(Map.of("PK", AttributeValue.fromS(pk), "SK", AttributeValue.fromS(sk))));
    }

    private static final java.time.Instant T0 = java.time.Instant.parse("2026-11-16T15:00:00Z");
    private static final java.time.Duration TWO = NotifyRepository.CONSUMER_CLAIM_ABANDONED;

    private NotifyRepository.GuardClaim once(String sk, java.time.Instant at) {
        return repo.claim(NotifyRepository.once("COACH#c1", sk, NotifyRepository.CONFIRMATION_SENT, at), at, TWO);
    }

    @Test
    void aDatedGuardIsClaimedOncePerValueAndTheNextValueClaimsItAgain() {
        put("COACH#c1", "PROFILE");
        NotifyRepository.Guard mon = NotifyRepository.dated("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16", T0);
        assertThat(repo.claim(mon, T0, TWO)).isEqualTo(NotifyRepository.GuardClaim.CLAIMED);
        repo.confirm(mon);
        NotifyRepository.Guard again = NotifyRepository.dated("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16", T0.plusSeconds(5));
        assertThat(repo.claim(again, T0.plusSeconds(5), TWO)).isEqualTo(NotifyRepository.GuardClaim.DONE);
        NotifyRepository.Guard tue = NotifyRepository.dated("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-17", T0.plusSeconds(10));
        assertThat(repo.claim(tue, T0.plusSeconds(10), TWO)).isEqualTo(NotifyRepository.GuardClaim.CLAIMED); // the next day
    }

    @Test
    void aOnceOnlyGuardIsClaimedOnceWhateverTheStamp() {
        // Two runs at once each stamp their own time: the second finds the first's claim in progress.
        put("COACH#c1", "SEAT#2026-11-16#06:00#s1");
        NotifyRepository.Guard first = NotifyRepository.once("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, T0);
        assertThat(repo.claim(first, T0, TWO)).isEqualTo(NotifyRepository.GuardClaim.CLAIMED);
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0.plusSeconds(1))).isEqualTo(NotifyRepository.GuardClaim.IN_PROGRESS);
        repo.confirm(first); // sent
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0.plus(TWO).plusSeconds(1))).isEqualTo(NotifyRepository.GuardClaim.DONE);
    }

    @Test
    void aReleasedGuardCanBeClaimedAgainAndSomeoneElsesClaimIsLeft() {
        put("COACH#c1", "SEAT#2026-11-16#06:00#s1");
        NotifyRepository.Guard first = NotifyRepository.once("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, T0);
        repo.claim(first, T0, TWO);
        repo.release(NotifyRepository.once("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, T0.plusSeconds(1)));
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0.plusSeconds(2))).isEqualTo(NotifyRepository.GuardClaim.IN_PROGRESS); // not its to give back
        repo.release(first);
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0.plusSeconds(3))).isEqualTo(NotifyRepository.GuardClaim.CLAIMED);
    }

    @Test
    void aClaimLeftByARunThatStoppedIsTakenAgainOnceAbandoned() {
        put("COACH#c1", "SEAT#2026-11-16#06:00#s1");
        repo.claim(NotifyRepository.once("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, T0), T0, TWO);
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0.plus(TWO).minusMillis(1))).isEqualTo(NotifyRepository.GuardClaim.IN_PROGRESS);
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0.plus(TWO))).isEqualTo(NotifyRepository.GuardClaim.CLAIMED);
    }

    @Test
    void nothingToClaimOnAnItemThatsGone() {
        assertThat(once("SEAT#2026-11-16#06:00#s1", T0)).isEqualTo(NotifyRepository.GuardClaim.DONE);
    }

    @Test
    void aPendingClaimDoesntCountAsSent() {
        String pending = NotifyRepository.once("COACH#c1", "SEAT#x", NotifyRepository.CONFIRMATION_SENT, T0).pending();
        assertThat(new NotifyRepository.SeatRow(null, null, Map.of(NotifyRepository.CONFIRMATION_SENT, pending))
                .has(NotifyRepository.CONFIRMATION_SENT)).isFalse();
        assertThat(new NotifyRepository.SeatRow(null, null, Map.of(NotifyRepository.CONFIRMATION_SENT, T0.toString()))
                .has(NotifyRepository.CONFIRMATION_SENT)).isTrue();
    }

    @Test
    void aLinesClaimWaitsWhileFreshAndIsTakenAgainOnceAbandoned() {
        String line = "CANCELLED#2026-11-16T00:00:00.000Z#b1#s1";
        put("COACH#c1", line);
        java.time.Instant t0 = java.time.Instant.parse("2026-11-23T12:00:00Z");
        assertThat(repo.claimLine("c1", line, t0)).isEqualTo(NotifyRepository.LineClaim.CLAIMED);
        assertThat(repo.claimLine("c1", line, t0.plus(NotifyRepository.LINE_CLAIM_ABANDONED).minusSeconds(1)))
                .isEqualTo(NotifyRepository.LineClaim.IN_PROGRESS);
        assertThat(repo.claimLine("c1", line, t0.plus(NotifyRepository.LINE_CLAIM_ABANDONED)))
                .isEqualTo(NotifyRepository.LineClaim.CLAIMED);
        repo.markLines("c1", List.of(line), "SENT", null, t0);
        assertThat(repo.claimLine("c1", line, t0.plusSeconds(3600))).isEqualTo(NotifyRepository.LineClaim.DONE);
        assertThat(repo.claimLine("c1", "CANCELLED#gone", t0)).isEqualTo(NotifyRepository.LineClaim.DONE);
    }


    @Test
    void emptyReadsAreEmpty() {
        assertThat(repo.coach("nobody")).isEmpty();
        assertThat(repo.family("nobody")).isEmpty();
        assertThat(repo.batch("c1", "CHANGEBATCH#2026-11-16T00:00:00.000Z#b1")).isEmpty();
        assertThat(repo.seatsOn(LocalDate.of(2026, 11, 16))).isEmpty();
        assertThat(repo.unpaid()).isEmpty();
        assertThat(repo.coachIds()).isEmpty();
    }

    @Test
    void coachIdsAreEveryCoachWithAProfile() {
        put("COACH#c1", "PROFILE");
        put("COACH#c2", "PROFILE");
        put("CLIENT#f1", "PROFILE");
        put("COACH#c1", "LESSON#2026-11-16#06:00");
        assertThat(repo.coachIds()).containsExactlyInAnyOrder("c1", "c2");
    }
}
