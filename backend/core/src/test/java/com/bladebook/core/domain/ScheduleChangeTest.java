package com.bladebook.core.domain;

import com.bladebook.core.domain.LessonTime.Status;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The one evaluator that compares the lesson times stored with the ones the schedule now makes (ADR-MASTER
 * section 9): add, remove and replace open times; cancel or re-price booked ones. Past times are never touched.
 */
class ScheduleChangeTest {

    private static final Instant NOW = Instant.parse("2026-11-09T12:00:00Z");

    private static LessonTime at(Duration fromNow, int price, Status status) {
        Instant start = NOW.plus(fromNow);
        return new LessonTime(LocalDate.of(2026, 11, 9), LocalTime.of(6, 0).plusMinutes(fromNow.toMinutes()), start,
                "America/Chicago", 30, price, "USD", 0, 24, 1, status == Status.BOOKED ? 1 : 0, 1, IceType.PUBLIC, 3, status);
    }

    private static LessonTime open(Duration fromNow, int price) {
        return at(fromNow, price, Status.OPEN);
    }

    private static LessonTime desired(LessonTime t) {
        return new LessonTime(t.lessonDate(), t.startTime(), t.startsAtUtc(), t.coachTz(), t.durationMinutes(), t.priceMinor(),
                t.currency(), t.missedLessonFeeMinor(), t.requiredNoticeHours(), t.maxSkaters(), 0, t.blockSeq(), t.iceType(),
                4, Status.OPEN);
    }

    private static final Duration IN_TWO_DAYS = Duration.ofDays(2);
    private static final Duration IN_TWO_HOURS = Duration.ofHours(2);

    @Test
    void aTimeTheScheduleNowMakesIsAdded() {
        LessonTime want = desired(open(IN_TWO_DAYS, 5000));
        ScheduleChange plan = ScheduleChange.plan(List.of(), List.of(want), NOW);
        assertThat(plan.add()).containsExactly(want);
        assertThat(plan.remove()).isEmpty();
        assertThat(plan.replace()).isEmpty();
    }

    @Test
    void anUnchangedTimeIsLeftAloneEvenThoughItsVersionIsOlder() {
        LessonTime have = open(IN_TWO_DAYS, 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(have), List.of(desired(have)), NOW);
        assertThat(plan.isEmpty()).isTrue();
    }

    @Test
    void openAndHeldTimesTheScheduleNoLongerMakesAreRemoved() {
        LessonTime open = open(IN_TWO_DAYS, 5000);
        LessonTime held = at(IN_TWO_DAYS.plusMinutes(30), 5000, Status.HELD);
        ScheduleChange plan = ScheduleChange.plan(List.of(open, held), List.of(), NOW);
        assertThat(plan.remove()).containsExactly(open, held);
    }

    @Test
    void aHeldTimeTheScheduleStillMakesStaysHeld() {
        LessonTime held = at(IN_TWO_DAYS, 5000, Status.HELD);
        ScheduleChange plan = ScheduleChange.plan(List.of(held), List.of(desired(open(IN_TWO_DAYS, 6000))), NOW);
        assertThat(plan.isEmpty()).isTrue();
    }

    private static LessonTime booked(Duration fromNow, int price) {
        return at(fromNow, price, Status.BOOKED);
    }

    @Test
    void aBookedTimeTheScheduleNoLongerMakesIsCancelled() {
        LessonTime gone = booked(IN_TWO_DAYS, 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(gone), List.of(), NOW);
        assertThat(plan.cancel()).containsExactly(new ScheduleChange.Cancel(gone, null));
        assertThat(plan.remove()).isEmpty();
        assertThat(plan.touchesBookings()).isTrue();
    }

    @Test
    void aBookedTimeWithANewLengthIsCancelledAndTheNewTimeTakesItsPlace() {
        LessonTime have = booked(IN_TWO_DAYS, 5000);
        LessonTime want = new LessonTime(have.lessonDate(), have.startTime(), have.startsAtUtc(), have.coachTz(), 60, 5000,
                "USD", 0, 24, 1, 0, 2, IceType.PUBLIC, 4, Status.OPEN);
        ScheduleChange plan = ScheduleChange.plan(List.of(have), List.of(want), NOW);
        assertThat(plan.cancel()).containsExactly(new ScheduleChange.Cancel(have, want));
        assertThat(plan.add()).isEmpty();
        assertThat(plan.replace()).isEmpty();
    }

    @Test
    void aBookedTimeAtANewPriceIsRepricedAndNeverAlsoCancelled() {
        LessonTime have = booked(IN_TWO_DAYS, 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(have), List.of(desired(open(IN_TWO_DAYS, 6000))), NOW);
        assertThat(plan.reprice()).containsExactly(new ScheduleChange.Reprice(have, 6000));
        assertThat(plan.cancel()).isEmpty();
        assertThat(plan.kept()).isEmpty();
    }

    @Test
    void aBookedIncreaseInsideTheNoticePeriodIsKeptAndListed() {
        LessonTime soon = booked(IN_TWO_HOURS, 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(soon), List.of(desired(open(IN_TWO_HOURS, 6000))), NOW);
        assertThat(plan.reprice()).isEmpty();
        assertThat(plan.kept()).containsExactly(new ScheduleChange.Reprice(soon, 6000));
    }

    @Test
    void aBookedIncreaseExactlyAtTheEndOfTheNoticePeriodIsStillKept() {
        LessonTime edge = booked(Duration.ofHours(24), 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(edge), List.of(desired(open(Duration.ofHours(24), 6000))), NOW);
        assertThat(plan.kept()).hasSize(1);
        LessonTime after = booked(Duration.ofHours(24).plusMinutes(1), 5000);
        assertThat(ScheduleChange.plan(List.of(after), List.of(desired(open(Duration.ofHours(24).plusMinutes(1), 6000))), NOW).reprice()).hasSize(1);
    }

    @Test
    void aBookedDecreaseReachesEvenTomorrowsLesson() {
        LessonTime soon = booked(IN_TWO_HOURS, 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(soon), List.of(desired(open(IN_TWO_HOURS, 4000))), NOW);
        assertThat(plan.reprice()).containsExactly(new ScheduleChange.Reprice(soon, 4000));
    }

    @Test
    void aBookedTimeWhoseIceTypeOrSkatersChangedIsLeftAlone() {
        LessonTime have = booked(IN_TWO_DAYS, 5000);
        LessonTime want = new LessonTime(have.lessonDate(), have.startTime(), have.startsAtUtc(), have.coachTz(), 30, 5000,
                "USD", 0, 24, 2, 0, 1, IceType.BFSC_FREESTYLE, 4, Status.OPEN);
        ScheduleChange plan = ScheduleChange.plan(List.of(have), List.of(want), NOW);
        assertThat(plan.isEmpty()).isTrue();
        assertThat(plan.touchesBookings()).isFalse();
    }

    @Test
    void aPastBookedTimeIsNeverCancelledOrRepriced() {
        LessonTime past = booked(Duration.ofHours(-1), 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(past), List.of(), NOW);
        assertThat(plan.touchesBookings()).isFalse();
    }

    @Test
    void aPriceDecreaseReachesAnOpenTimeAtOnce() {
        LessonTime have = open(IN_TWO_HOURS, 5000);
        LessonTime want = desired(open(IN_TWO_HOURS, 4000));
        assertThat(ScheduleChange.plan(List.of(have), List.of(want), NOW).replace()).containsExactly(want);
    }

    @Test
    void aPriceIncreaseReachesOnlyTimesPastTheNoticePeriod() {
        LessonTime soon = open(IN_TWO_HOURS, 5000);
        LessonTime later = open(IN_TWO_DAYS, 5000);
        LessonTime soonWant = desired(open(IN_TWO_HOURS, 6000));
        LessonTime laterWant = desired(open(IN_TWO_DAYS, 6000));
        ScheduleChange plan = ScheduleChange.plan(List.of(soon, later), List.of(soonWant, laterWant), NOW);
        assertThat(plan.replace()).containsExactly(laterWant);
    }

    @Test
    void insideTheNoticePeriodOtherChangesStillApplyButThePriceStays() {
        LessonTime soon = open(IN_TWO_HOURS, 5000);
        LessonTime want = desired(open(IN_TWO_HOURS, 6000));
        LessonTime shared = new LessonTime(want.lessonDate(), want.startTime(), want.startsAtUtc(), want.coachTz(), 30, 6000,
                "USD", 0, 24, 2, 0, 1, IceType.PUBLIC, 4, Status.OPEN);

        ScheduleChange plan = ScheduleChange.plan(List.of(soon), List.of(shared), NOW);

        assertThat(plan.replace()).singleElement().satisfies(r -> {
            assertThat(r.maxSkaters()).isEqualTo(2);
            assertThat(r.priceMinor()).isEqualTo(5000);
        });
    }

    @Test
    void aNewLengthAtTheSameStartReplacesTheOpenTime() {
        LessonTime have = open(IN_TWO_DAYS, 5000);
        LessonTime want = new LessonTime(have.lessonDate(), have.startTime(), have.startsAtUtc(), have.coachTz(), 60, 5000,
                "USD", 0, 24, 1, 0, 2, IceType.PUBLIC, 4, Status.OPEN);
        assertThat(ScheduleChange.plan(List.of(have), List.of(want), NOW).replace()).containsExactly(want);
    }

    @Test
    void pastTimesAreNeverTouched() {
        LessonTime past = open(Duration.ofHours(-1), 5000);
        ScheduleChange plan = ScheduleChange.plan(List.of(past), List.of(), NOW);
        assertThat(plan.isEmpty()).isTrue();
    }

    @Test
    void desiredTimesInThePastAreNotAdded() {
        ScheduleChange plan = ScheduleChange.plan(List.of(), List.of(desired(open(Duration.ZERO, 5000))), NOW);
        assertThat(plan.add()).isEmpty();
    }
}
