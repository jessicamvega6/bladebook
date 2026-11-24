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

    @Test
    void aGuardIsClaimedOncePerValue() {
        put("COACH#c1", "PROFILE");
        assertThat(repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16")).isTrue();
        assertThat(repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16")).isFalse();
        assertThat(repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-17")).isTrue(); // the next day
    }

    @Test
    void aOnceOnlyGuardIsClaimedOnceWhateverTheStamp() {
        // Two runs at once each stamp their own time: the second must still find it taken.
        put("COACH#c1", "SEAT#2026-11-16#06:00#s1");
        assertThat(repo.claimOnce("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "2026-11-16T15:00:00Z")).isTrue();
        assertThat(repo.claimOnce("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "2026-11-16T15:00:01Z")).isFalse();
        repo.release("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "2026-11-16T15:00:01Z"); // not its claim
        assertThat(repo.claimOnce("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "2026-11-16T15:00:02Z")).isFalse();
        repo.release("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "2026-11-16T15:00:00Z");
        assertThat(repo.claimOnce("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "2026-11-16T15:00:03Z")).isTrue();
    }

    @Test
    void aReleasedGuardCanBeClaimedAgain() {
        put("COACH#c1", "PROFILE");
        repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16");
        repo.release("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16");
        assertThat(repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16")).isTrue();
    }

    @Test
    void releasingSomeoneElsesClaimLeavesIt() {
        put("COACH#c1", "PROFILE");
        repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-17");
        repo.release("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-16");
        assertThat(repo.claim("COACH#c1", "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, "2026-11-17")).isFalse();
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
    void nothingToClaimOnAnItemThatsGone() {
        assertThat(repo.claim("COACH#c1", "SEAT#2026-11-16#06:00#s1", NotifyRepository.CONFIRMATION_SENT, "x")).isFalse();
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
