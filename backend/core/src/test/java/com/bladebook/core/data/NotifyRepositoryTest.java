package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.LocalDate;
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
