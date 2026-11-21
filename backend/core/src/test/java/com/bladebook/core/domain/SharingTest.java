package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The rules of a shared lesson that don't need the database (ADR-MASTER section 8). */
class SharingTest {

    private static final Instant START = Instant.parse("2026-11-30T12:00:00Z");

    // ---------------------------------------------------------------- answer-by (B2)

    @Test
    void answerByIsTheStartOfTheNoticePeriodWhenThatComesFirst() {
        Instant left = START.minus(Duration.ofDays(3));
        assertThat(Sharing.answerBy(START, 24, left)).isEqualTo(START.minus(Duration.ofHours(24)));
    }

    @Test
    void answerByIsSevenDaysAfterTheLeaveWhenThatComesFirst() {
        Instant left = START.minus(Duration.ofDays(20));
        assertThat(Sharing.answerBy(START, 24, left)).isEqualTo(left.plus(Duration.ofDays(7)));
    }

    @Test
    void answerByWhenBothAreTheSameMoment() {
        Instant left = START.minus(Duration.ofDays(8));
        assertThat(Sharing.answerBy(START, 24, left)).isEqualTo(START.minus(Duration.ofDays(1)));
    }

    @Test
    void answerByUsesTheLessonsOwnNoticePeriod() {
        Instant left = START.minus(Duration.ofDays(3));
        assertThat(Sharing.answerBy(START, 48, left)).isEqualTo(START.minus(Duration.ofHours(48)));
    }

    // ---------------------------------------------------------------- what a family's cancel does

    @Test
    void theOnlySkaterInALessonReleasesIt() {
        assertThat(Sharing.leave(1, 1, false)).isEqualTo(Sharing.Leave.RELEASE);
        assertThat(Sharing.leave(1, 1, true)).isEqualTo(Sharing.Leave.RELEASE);
    }

    @Test
    void theLastSkaterAfterTheOtherLeftReleasesIt() {
        // The other left in time (shareCount still 2 until the staying family answers) or late (it stays 2).
        assertThat(Sharing.leave(1, 2, false)).isEqualTo(Sharing.Leave.RELEASE);
    }

    @Test
    void cancellingWithAnUnansweredInvitationWithdrawsIt() {
        assertThat(Sharing.leave(2, 1, false)).isEqualTo(Sharing.Leave.WITHDRAW);
        assertThat(Sharing.leave(2, 1, true)).isEqualTo(Sharing.Leave.WITHDRAW);
    }

    @Test
    void leavingAJoinedLessonInTimeAsksTheOtherFamily() {
        assertThat(Sharing.leave(2, 2, false)).isEqualTo(Sharing.Leave.IN_TIME);
    }

    @Test
    void leavingAJoinedLessonLateLeavesTheOtherSkatersShare() {
        assertThat(Sharing.leave(2, 2, true)).isEqualTo(Sharing.Leave.LATE);
    }

    @Test
    void aLessonWithNoSeatIsNotSomethingToLeave() {
        assertThatThrownBy(() -> Sharing.leave(0, 0, false)).isInstanceOf(IllegalArgumentException.class);
    }

    // ---------------------------------------------------------------- worked out from the clock (B8)

    @Test
    void anInvitationExpiresWhenItsLessonStarts() {
        assertThat(Sharing.expired(START, START.minusSeconds(1))).isFalse();
        assertThat(Sharing.expired(START, START)).isTrue();
        assertThat(Sharing.expired(START, START.plusSeconds(1))).isTrue();
    }

    @Test
    void aDateNotAnsweredByItsTimeIsCancelledWithNoAnswer() {
        Instant by = START.minus(Duration.ofHours(24));
        assertThat(Sharing.noAnswer(by, by.minusSeconds(1))).isFalse();
        assertThat(Sharing.noAnswer(by, by)).isTrue();
        assertThat(Sharing.noAnswer(null, by)).isFalse();
    }

    // ---------------------------------------------------------------- the sweep's index key

    @Test
    void theDeadlineKeySortsByTimeThenCoachThenItem() {
        assertThat(Sharing.dueKey(Instant.parse("2026-11-29T12:00:00.123Z"), "coach-1", "LESSON#2026-11-30#06:00"))
                .isEqualTo("2026-11-29T12:00:00Z#coach-1#LESSON#2026-11-30#06:00");
    }
}
