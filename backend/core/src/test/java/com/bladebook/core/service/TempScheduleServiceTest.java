package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.TempSchedule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Time off and special schedules (the booked-lesson side is in ScheduleChangeBookedTest). */
class TempScheduleServiceTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-10T15:00:00Z");

    private TempScheduleService temps;
    private AccessContext dana;

    @BeforeEach
    void setUp() {
        FamilyTestSupport t = new FamilyTestSupport();
        ScheduleRepository repo = new ScheduleRepository(t.f.clients, t.f.table);
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        temps = new TempScheduleService(repo, t.coaches, new ScheduleChangeService(repo, t.coaches, clock), clock);
        dana = t.coach("Dana", "7K2Q-M9XT");
    }

    private static TempSchedule off(String name, String from, String to) {
        return new TempSchedule(null, TempSchedule.Kind.TIME_OFF, name, LocalDate.parse(from), LocalDate.parse(to), List.of(), Map.of());
    }

    @Test
    void aNewOneGetsAnIdAndTheHubListsItByStartDate() {
        TempSchedule later = temps.save(dana, off("Winter", "2026-12-28", "2026-12-31"));
        TempSchedule sooner = temps.save(dana, off("", "2026-11-26", "2026-11-27"));
        assertThat(sooner.tempId()).isNotBlank();
        assertThat(temps.upcoming(dana)).extracting(TempSchedule::displayName).containsExactly("Time off", "Winter");
        assertThat(temps.get(dana, later.tempId()).name()).isEqualTo("Winter");
    }

    @Test
    void anEditKeepsItsIdAndCanMoveItsDates() {
        TempSchedule saved = temps.save(dana, off("Winter", "2026-12-28", "2026-12-31"));
        TempSchedule moved = temps.save(dana, new TempSchedule(saved.tempId(), TempSchedule.Kind.TIME_OFF, "Winter",
                LocalDate.parse("2026-12-29"), LocalDate.parse("2027-01-02"), List.of(), Map.of()));
        assertThat(moved.tempId()).isEqualTo(saved.tempId());
        assertThat(temps.upcoming(dana)).hasSize(1);
    }

    @Test
    void problemsComeBackTogetherAndNothingIsSaved() {
        assertThatThrownBy(() -> temps.save(dana, off("", "2026-11-05", "2026-11-04")))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("dates"))
                .hasMessage("The last day is before the first day.");
        assertThat(temps.upcoming(dana)).isEmpty();
    }

    @Test
    void anUnknownIdIsNotFound() {
        assertThatThrownBy(() -> temps.get(dana, "nope")).hasMessage("That time off or special schedule couldn’t be found.");
    }
}
