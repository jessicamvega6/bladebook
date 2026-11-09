package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import static com.bladebook.core.service.ScheduleTestSupport.days;
import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The schedule-change consumer's work for Batch 2 (ADR-MASTER section 9): after a save, lesson times are
 * made, updated and removed to match, from today to the end of the booking window plus 12 months.
 */
class ScheduleChangeServiceTest {

    /** Monday, November 9, 2026, 6:00 AM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-09T12:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 9);
    private static final LocalDate LAST = LocalDate.of(2028, 1, 31);

    private ScheduleService schedules;
    private ScheduleChangeService change;
    private ScheduleRepository repo;
    private AccessContext ctx;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        CoachRepository coaches = new CoachRepository(f.clients, f.table);
        repo = new ScheduleRepository(f.clients, f.table);
        schedules = new ScheduleService(repo, coaches);
        change = new ScheduleChangeService(repo, coaches, Clock.fixed(NOW, ZoneOffset.UTC));
        ctx = new AccessContext(UUID.randomUUID().toString());
        ScheduleTestSupport.signUp(coaches, ctx);
    }

    private List<LessonTime> on(LocalDate d) {
        return repo.lessonTimes(ctx, d, d);
    }

    @Test
    void theFirstSaveMakesLessonTimesFromNowToTheEndOfTheWindowPlusTwelveMonths() {
        schedules.save(ctx, 0, List.of(mondayMornings(5000)));

        ScheduleChangeService.Result r = change.apply(ctx);

        // Today's 6:00 has started; 6:30, 7:00 and 7:30 are still ahead.
        assertThat(on(TODAY)).extracting(LessonTime::startTime)
                .containsExactly(LocalTime.of(6, 30), LocalTime.of(7, 0), LocalTime.of(7, 30));
        assertThat(on(LocalDate.of(2028, 1, 31))).hasSize(4);           // the last day kept is a Monday
        assertThat(repo.lessonTimes(ctx, LAST.plusDays(1), LAST.plusDays(40))).isEmpty();
        int mondays = repo.lessonTimes(ctx, TODAY, LAST).size();
        assertThat(r.added()).isEqualTo(mondays);
        assertThat(mondays).isEqualTo(3 + 64 * 4);                     // today, then 64 more Mondays
        LessonTime t = on(TODAY).get(0);
        assertThat(t.lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(t.coachTz()).isEqualTo("America/Chicago");
        assertThat(t.currency()).isEqualTo("USD");
        assertThat(t.requiredNoticeHours()).isEqualTo(24);
        assertThat(t.scheduleVersion()).isEqualTo(1);
    }

    @Test
    void runningItTwiceHasOneEffect() {
        schedules.save(ctx, 0, List.of(mondayMornings(5000)));
        change.apply(ctx);

        ScheduleChangeService.Result again = change.apply(ctx);

        assertThat(again.added() + again.removed() + again.replaced() + again.skipped()).isZero();
    }

    @Test
    void aChangedScheduleAddsRemovesAndRepricesOpenTimes() {
        schedules.save(ctx, 0, List.of(mondayMornings(5000)));
        change.apply(ctx);

        // Mondays drop to $40 and end at 7:00; Wednesdays 3–5 PM are new.
        schedules.save(ctx, 1, List.of(
                new com.bladebook.core.domain.BlockTemplate(1, "Morning ice", LocalTime.of(6, 0), LocalTime.of(7, 0), 30, 4000, 1,
                        com.bladebook.core.domain.IceType.BFSC_FREESTYLE, EnumSet.of(DayOfWeek.MONDAY), java.util.Map.of()),
                days(2, EnumSet.of(DayOfWeek.WEDNESDAY), 15, 17)));
        ScheduleChangeService.Result r = change.apply(ctx);

        LocalDate nextMonday = TODAY.plusDays(7);
        assertThat(on(nextMonday)).extracting(LessonTime::startTime, LessonTime::priceMinor, LessonTime::scheduleVersion)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(LocalTime.of(6, 0), 4000, 2L),
                        org.assertj.core.groups.Tuple.tuple(LocalTime.of(6, 30), 4000, 2L));
        assertThat(on(TODAY.plusDays(2))).extracting(LessonTime::startTime)
                .containsExactly(LocalTime.of(15, 0), LocalTime.of(16, 0));
        assertThat(r.removed()).isGreaterThan(0);
        assertThat(r.replaced()).isGreaterThan(0);
        assertThat(r.added()).isGreaterThan(0);
    }

    @Test
    void aPriceIncreaseWaitsOutTheNoticePeriod() {
        schedules.save(ctx, 0, List.of(mondayMornings(5000)));
        change.apply(ctx);

        schedules.save(ctx, 1, List.of(mondayMornings(6000)));
        change.apply(ctx);

        assertThat(on(TODAY)).extracting(LessonTime::priceMinor).containsOnly(5000);      // within 24 hours
        assertThat(on(TODAY.plusDays(7))).extracting(LessonTime::priceMinor).containsOnly(6000);
    }

    @Test
    void emptyingTheWeekRemovesEveryOpenTime() {
        schedules.save(ctx, 0, List.of(mondayMornings(5000)));
        change.apply(ctx);
        repo.saveDefault(ctx, new com.bladebook.core.domain.WeeklySchedule(java.util.Map.of(), 2));

        change.apply(ctx);

        assertThat(repo.lessonTimes(ctx, TODAY, LAST)).isEmpty();
    }

    @Test
    void aCoachWithNoScheduleGetsNoLessonTimes() {
        assertThat(change.apply(ctx).added()).isZero();
    }

    @Test
    void aCoachWhoHasntFinishedSignUpIsNotFound() {
        assertThatThrownBy(() -> change.apply(new AccessContext(UUID.randomUUID().toString())))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NOT_FOUND));
    }
}
