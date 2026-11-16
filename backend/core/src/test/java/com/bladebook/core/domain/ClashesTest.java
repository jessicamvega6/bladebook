package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Which of a skater's other lessons a lesson overlaps (ADR-MASTER section 7, "Clash warning, not refusal"; B7). */
class ClashesTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 16);

    private static Clashes.Slot slot(LocalDate d, int h, int m, int len, String coach) {
        return new Clashes.Slot(d, LocalTime.of(h, m), len, coach);
    }

    @Test
    void anOverlapInTimeClashes() {
        var c = Clashes.of(List.of(slot(MON, 6, 0, 30, "dana")), List.of(slot(MON, 6, 15, 30, "ben")));
        assertThat(c).hasSize(1);
        assertThat(c.get(0).lesson().startTime()).isEqualTo(LocalTime.of(6, 0));
        assertThat(c.get(0).other().coachId()).isEqualTo("ben");
    }

    @Test
    void lessonsThatOnlyTouchDontClash() {
        assertThat(Clashes.of(List.of(slot(MON, 6, 0, 30, "dana")), List.of(slot(MON, 6, 30, 30, "ben")))).isEmpty();
        assertThat(Clashes.of(List.of(slot(MON, 6, 30, 30, "dana")), List.of(slot(MON, 6, 0, 30, "ben")))).isEmpty();
    }

    @Test
    void anotherDayNeverClashes() {
        assertThat(Clashes.of(List.of(slot(MON, 6, 0, 30, "dana")), List.of(slot(MON.plusDays(1), 6, 0, 30, "ben")))).isEmpty();
    }

    @Test
    void theSameLessonIsntAClashWithItself() {
        assertThat(Clashes.of(List.of(slot(MON, 6, 0, 30, "dana")), List.of(slot(MON, 6, 0, 30, "dana")))).isEmpty();
    }

    @Test
    void everyClashingDateIsListedNotJustTheFirstFew() {
        List<Clashes.Slot> mine = new ArrayList<>();
        List<Clashes.Slot> other = new ArrayList<>();
        for (int w = 0; w < 12; w++) {
            mine.add(slot(MON.plusWeeks(w), 6, 0, 60, "dana"));
            other.add(slot(MON.plusWeeks(w), 6, 30, 30, "ben"));
        }
        assertThat(Clashes.of(mine, other)).hasSize(12);
    }

    @Test
    void oneLessonCanClashWithTwoOthers() {
        var c = Clashes.of(List.of(slot(MON, 6, 0, 90, "dana")),
                List.of(slot(MON, 6, 0, 30, "ben"), slot(MON, 7, 0, 30, "lauren")));
        assertThat(c).extracting(x -> x.other().coachId()).containsExactly("ben", "lauren");
    }
}
