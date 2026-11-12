package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CoachCancelRequestTest {

    private static CoachCancelRequest.PickInput pick(String date, String time, String after) {
        return new CoachCancelRequest.PickInput(date, time, after);
    }

    @Test
    void oneLessonWithItsChoice() {
        CoachCancelRequest r = CoachCancelRequest.parse("LESSON", List.of(pick("2026-11-16", "06:00", "HOLD")), null);
        assertThat(r.scope()).isEqualTo(ChangeBatch.Source.LESSON);
        assertThat(r.picks()).containsExactly(new CoachCancelRequest.Pick(LocalDate.of(2026, 11, 16), LocalTime.of(6, 0), AfterCancel.HOLD));
        assertThat(r.first()).isEqualTo(LocalDate.of(2026, 11, 16));
        assertThat(r.last()).isEqualTo(LocalDate.of(2026, 11, 16));
    }

    @Test
    void aDayAsksEachLessonOnItsOwn() {
        CoachCancelRequest r = CoachCancelRequest.parse("DAY", List.of(pick("2026-11-16", "06:00", "RELEASE"),
                pick("2026-11-16", "06:30", "HOLD")), null);
        assertThat(r.picks()).extracting(CoachCancelRequest.Pick::after).containsExactly(AfterCancel.RELEASE, AfterCancel.HOLD);
    }

    @Test
    void aRepeatedTimeIsCountedOnce() {
        CoachCancelRequest r = CoachCancelRequest.parse("DAY", List.of(pick("2026-11-16", "06:00", "RELEASE"),
                pick("2026-11-16", "06:00", "HOLD")), null);
        assertThat(r.picks()).hasSize(1);
        assertThat(r.picks().get(0).after()).isEqualTo(AfterCancel.RELEASE);
    }

    @Test
    void aDayCantSpanTwoDates() {
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", List.of(pick("2026-11-16", "06:00", "HOLD"),
                pick("2026-11-17", "06:00", "HOLD")), null)).hasMessage("Cancel day takes the lessons of one day.");
    }

    @Test
    void oneLessonMeansOne() {
        assertThatThrownBy(() -> CoachCancelRequest.parse("LESSON", List.of(pick("2026-11-16", "06:00", "HOLD"),
                pick("2026-11-16", "06:30", "HOLD")), null)).hasMessage("Cancel one lesson at a time here.");
    }

    @Test
    void theWeekNamesItsSundayAndNothingElse() {
        CoachCancelRequest r = CoachCancelRequest.parse("WEEK", null, "2026-11-15");
        assertThat(r.scope()).isEqualTo(ChangeBatch.Source.WEEK);
        assertThat(r.picks()).isEmpty();
        assertThat(r.first()).isEqualTo(LocalDate.of(2026, 11, 15));
        assertThat(r.last()).isEqualTo(LocalDate.of(2026, 11, 21));
    }

    @Test
    void theWeekMustStartOnASundayAndTakesNoPicks() {
        assertThatThrownBy(() -> CoachCancelRequest.parse("WEEK", null, "2026-11-16")).hasMessage("A week starts on a Sunday.");
        assertThatThrownBy(() -> CoachCancelRequest.parse("WEEK", List.of(pick("2026-11-16", "06:00", "RELEASE")), "2026-11-15"))
                .hasMessage("Cancel rest of week picks its own lessons.");
        assertThatThrownBy(() -> CoachCancelRequest.parse("WEEK", null, "next week")).hasMessage("That date isn’t valid.");
    }

    @Test
    void badInputIsRefused() {
        assertThatThrownBy(() -> CoachCancelRequest.parse("MONTH", List.of(), null)).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", List.of(), null)).hasMessage("Choose at least one lesson to cancel.");
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", null, null)).hasMessage("Choose at least one lesson to cancel.");
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", List.of(pick("2026-11-16", "6am", "HOLD")), null)).hasMessage("That time isn’t valid.");
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", List.of(pick("2026-11-16", "06:00", "KEEP")), null))
                .hasMessage("Choose release or hold for each lesson.");
        List<CoachCancelRequest.PickInput> withNull = new ArrayList<>();
        withNull.add(null);
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", withNull, null)).isInstanceOf(DomainException.class);
    }

    @Test
    void atMostOneHundredPicks() {
        List<CoachCancelRequest.PickInput> many = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            many.add(pick("2026-11-16", LocalTime.of(0, 0).plusMinutes(i * 10L).toString(), "HOLD"));
        }
        assertThatThrownBy(() -> CoachCancelRequest.parse("DAY", many, null)).hasMessage("That’s more lessons than one day holds.");
        assertThat(CoachCancelRequest.parse("DAY", many.subList(0, 100), null).picks()).hasSize(100);
    }
}
