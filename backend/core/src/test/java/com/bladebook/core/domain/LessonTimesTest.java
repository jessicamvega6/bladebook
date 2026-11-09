package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The lesson times a schedule makes for a range of dates, in the coach's time zone (ADR-031 decision 1). */
class LessonTimesTest {

    private static final ZoneId CHICAGO = ZoneId.of("America/Chicago");
    private static final Instant LONG_AGO = Instant.parse("2020-01-01T00:00:00Z");

    private static ScheduleBlock block(LocalTime start, LocalTime end, int minutes) {
        return new ScheduleBlock(2, "Morning ice", start, end, minutes, 4501, 0, 2, IceType.BFSC_FREESTYLE);
    }

    private static WeeklySchedule every(DayOfWeek day, ScheduleBlock... blocks) {
        return new WeeklySchedule(Map.of(day, List.of(blocks)), 7);
    }

    private static List<LessonTime> make(WeeklySchedule w, Map<LocalDate, List<ScheduleBlock>> overrides,
                                         LocalDate from, LocalDate to, Instant now) {
        return LessonTimes.make(w, overrides, from, to, CHICAGO, "USD", 24, now);
    }

    @Test
    void eachSlotBecomesAnOpenLessonTimeWithEveryStamp() {
        LocalDate monday = LocalDate.of(2026, 11, 9);
        List<LessonTime> times = make(every(DayOfWeek.MONDAY, block(LocalTime.of(6, 0), LocalTime.of(7, 0), 30)),
                Map.of(), monday, monday, LONG_AGO);

        assertThat(times).containsExactly(
                new LessonTime(monday, LocalTime.of(6, 0), Instant.parse("2026-11-09T12:00:00Z"), "America/Chicago", 30,
                        4501, "USD", 0, 24, 2, 0, 2, IceType.BFSC_FREESTYLE, 7, LessonTime.Status.OPEN),
                new LessonTime(monday, LocalTime.of(6, 30), Instant.parse("2026-11-09T12:30:00Z"), "America/Chicago", 30,
                        4501, "USD", 0, 24, 2, 0, 2, IceType.BFSC_FREESTYLE, 7, LessonTime.Status.OPEN));
        assertThat(times.get(0).key()).isEqualTo("LESSON#2026-11-09#06:00");
    }

    @Test
    void everyDateInTheRangeIsCoveredInclusive() {
        List<LessonTime> times = make(every(DayOfWeek.MONDAY, block(LocalTime.of(6, 0), LocalTime.of(6, 30), 30)),
                Map.of(), LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 23), LONG_AGO);
        assertThat(times).extracting(LessonTime::lessonDate)
                .containsExactly(LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 23));
    }

    @Test
    void aTimeThatHasAlreadyStartedIsNotMade() {
        LocalDate monday = LocalDate.of(2026, 11, 9);
        Instant at630 = Instant.parse("2026-11-09T12:30:00Z");
        List<LessonTime> times = make(every(DayOfWeek.MONDAY, block(LocalTime.of(6, 0), LocalTime.of(7, 30), 30)),
                Map.of(), monday, monday, at630);
        assertThat(times).extracting(LessonTime::startTime).containsExactly(LocalTime.of(7, 0));
    }

    @Test
    void anOverrideAndAnEmptyOverrideReplaceTheDefault() {
        LocalDate first = LocalDate.of(2026, 11, 9);
        LocalDate second = LocalDate.of(2026, 11, 16);
        Map<LocalDate, List<ScheduleBlock>> overrides = Map.of(
                first, List.of(block(LocalTime.of(9, 0), LocalTime.of(10, 0), 60)),
                second, List.of());
        List<LessonTime> times = make(every(DayOfWeek.MONDAY, block(LocalTime.of(6, 0), LocalTime.of(6, 30), 30)),
                overrides, first, second, LONG_AGO);
        assertThat(times).extracting(LessonTime::key).containsExactly("LESSON#2026-11-09#09:00");
    }

    @Test
    void springForwardSkipsTimesThatDontExist() {
        // 2027-03-14: Chicago's clocks go from 1:59:59 AM to 3:00 AM.
        LocalDate day = LocalDate.of(2027, 3, 14);
        List<LessonTime> times = make(every(DayOfWeek.SUNDAY, block(LocalTime.of(1, 0), LocalTime.of(4, 0), 30)),
                Map.of(), day, day, LONG_AGO);

        assertThat(times).extracting(LessonTime::startTime)
                .containsExactly(LocalTime.of(1, 0), LocalTime.of(1, 30), LocalTime.of(3, 0), LocalTime.of(3, 30));
        assertThat(times.get(1).startsAtUtc()).isEqualTo(Instant.parse("2027-03-14T07:30:00Z")); // still CST
        assertThat(times.get(2).startsAtUtc()).isEqualTo(Instant.parse("2027-03-14T08:00:00Z")); // CDT
    }

    @Test
    void fallBackUsesTheFirstOneOClockAndSkipsALessonThatWouldRunLong() {
        // 2027-11-07: Chicago's clocks go from 1:59:59 AM CDT back to 1:00 AM CST.
        LocalDate day = LocalDate.of(2027, 11, 7);
        List<LessonTime> times = make(every(DayOfWeek.SUNDAY, block(LocalTime.of(0, 30), LocalTime.of(2, 30), 30)),
                Map.of(), day, day, LONG_AGO);

        // 1:30 to 2:00 on the clock would really last 90 minutes, so it isn't made.
        assertThat(times).extracting(LessonTime::startTime)
                .containsExactly(LocalTime.of(0, 30), LocalTime.of(1, 0), LocalTime.of(2, 0));
        assertThat(times.get(1).startsAtUtc()).isEqualTo(Instant.parse("2027-11-07T06:00:00Z")); // 1:00 CDT
        assertThat(times.get(2).startsAtUtc()).isEqualTo(Instant.parse("2027-11-07T08:00:00Z")); // 2:00 CST
    }

    @Test
    void noScheduleMakesNothing() {
        assertThat(make(null, Map.of(), LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 15), LONG_AGO)).isEmpty();
    }
}
