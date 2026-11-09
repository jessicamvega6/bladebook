package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The coach's month, week and day views read one range of dates (ADR-MASTER section 6, Calendars). */
class CalendarServiceTest {

    /** Monday, November 9, 2026, 6:10 AM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-09T12:10:00Z");
    private static final LocalDate SUNDAY = LocalDate.of(2026, 11, 8);

    private CalendarService calendar;
    private ScheduleService schedules;
    private ScheduleChangeService change;
    private AccessContext ctx;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        CoachRepository coaches = new CoachRepository(f.clients, f.table);
        ScheduleRepository repo = new ScheduleRepository(f.clients, f.table);
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        schedules = new ScheduleService(repo, coaches);
        change = new ScheduleChangeService(repo, coaches, clock);
        calendar = new CalendarService(repo, coaches, clock);
        ctx = new AccessContext(UUID.randomUUID().toString());
        ScheduleTestSupport.signUp(coaches, ctx);
    }

    @Test
    void aWeekShowsEveryDayWithItsLessonTimesInTheCoachsTimeZone() {
        schedules.save(ctx, 0, List.of(mondayMornings(5000)));
        change.apply(ctx);

        CalendarService.CalendarView v = calendar.range(ctx, SUNDAY, SUNDAY.plusDays(6));

        assertThat(v.coachTimezone()).isEqualTo("America/Chicago");
        assertThat(v.today()).isEqualTo(LocalDate.of(2026, 11, 9));
        assertThat(v.now()).isEqualTo(LocalTime.of(6, 10));
        assertThat(v.hasSchedule()).isTrue();
        assertThat(v.days()).hasSize(7);
        assertThat(v.days().get(0).lessons()).isEmpty();
        assertThat(v.days().get(1).date()).isEqualTo(LocalDate.of(2026, 11, 9));
        assertThat(v.days().get(1).lessons()).extracting(t -> t.startTime().toString()).containsExactly("06:30", "07:00", "07:30");
        assertThat(v.days().get(1).override()).isFalse();
    }

    @Test
    void aCoachWithNoScheduleIsToldSo() {
        CalendarService.CalendarView v = calendar.range(ctx, SUNDAY, SUNDAY.plusDays(6));
        assertThat(v.hasSchedule()).isFalse();
        assertThat(v.days()).allSatisfy(d -> assertThat(d.lessons()).isEmpty());
    }

    @Test
    void aMonthGridOfSixWeeksIsAllowedButNotMore() {
        assertThat(calendar.range(ctx, SUNDAY, SUNDAY.plusDays(41)).days()).hasSize(42);
        assertThatThrownBy(() -> calendar.range(ctx, SUNDAY, SUNDAY.plusDays(42))).isInstanceOf(DomainException.class);
    }

    @Test
    void theEndCantComeBeforeTheStart() {
        assertThatThrownBy(() -> calendar.range(ctx, SUNDAY, SUNDAY.minusDays(1))).isInstanceOf(DomainException.class);
    }
}
