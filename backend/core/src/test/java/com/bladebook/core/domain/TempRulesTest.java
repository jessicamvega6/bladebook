package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Checks before review for time off and special schedules, including overlapping ranges. */
class TempRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    private static TempSchedule off(String id, String name, String from, String to) {
        return new TempSchedule(id, TempSchedule.Kind.TIME_OFF, name, LocalDate.parse(from), LocalDate.parse(to), List.of(), Map.of());
    }

    private static BlockTemplate block(int seq, String name, int startHour, int endHour) {
        return new BlockTemplate(seq, name, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), 60, 8000, 1, IceType.BFSC_FREESTYLE,
                Set.of(), Map.of());
    }

    private static TempSchedule special(String id, String name, String from, String to, BlockTemplate... blocks) {
        return new TempSchedule(id, TempSchedule.Kind.SPECIAL, name, LocalDate.parse(from), LocalDate.parse(to), List.of(blocks), Map.of());
    }

    private static final TempSchedule CAMP = special("camp", "Holiday camp week", "2026-12-21", "2026-12-27", block(1, "Camp ice", 9, 16));
    private static final TempSchedule THANKSGIVING = off("tg", "Thanksgiving break", "2026-11-22", "2026-11-28");

    @Test
    void timeOffClearOfEverythingIsFine() {
        assertThat(TempRules.problems(off("new", "Fall break", "2026-10-26", "2026-10-27"), List.of(CAMP, THANKSGIVING), TODAY, null)).isEmpty();
    }

    @Test
    void anOverlapNamesTheOtherOneTheSharedDatesAndTheWayOut() {
        assertThat(TempRules.problems(off("new", "", "2026-11-23", "2026-11-24"), List.of(CAMP, THANKSGIVING), TODAY, null))
                .containsExactly("These dates overlap Thanksgiving break (Nov 22 – 28) on Nov 23 – 24. Edit Thanksgiving break to change those days, or choose dates outside it.");
    }

    @Test
    void touchingOnTheFirstOrLastDayIsAnOverlapButTheNextDayIsnt() {
        assertThat(TempRules.problems(off("new", "", "2026-11-28", "2026-11-30"), List.of(THANKSGIVING), TODAY, null)).hasSize(1);
        assertThat(TempRules.problems(off("new", "", "2026-11-18", "2026-11-22"), List.of(THANKSGIVING), TODAY, null)).hasSize(1);
        assertThat(TempRules.problems(off("new", "", "2026-11-29", "2026-11-30"), List.of(THANKSGIVING), TODAY, null)).isEmpty();
        assertThat(TempRules.problems(off("new", "", "2026-11-20", "2026-11-21"), List.of(THANKSGIVING), TODAY, null)).isEmpty();
    }

    @Test
    void aRangeThatSurroundsAnotherOverlapsAllOfIt() {
        assertThat(TempRules.problems(off("new", "", "2026-11-01", "2026-12-31"), List.of(THANKSGIVING, CAMP), TODAY, null))
                .containsExactly(
                        "These dates overlap Thanksgiving break (Nov 22 – 28) on Nov 22 – 28. Edit Thanksgiving break to change those days, or choose dates outside it.",
                        "These dates overlap Holiday camp week (Dec 21 – 27) on Dec 21 – 27. Edit Holiday camp week to change those days, or choose dates outside it.");
    }

    @Test
    void editingOneDoesntOverlapItself() {
        assertThat(TempRules.problems(off("tg", "Thanksgiving break", "2026-11-21", "2026-11-28"), List.of(THANKSGIVING), TODAY, null)).isEmpty();
    }

    @Test
    void anUnnamedOneIsNamedByItsKind() {
        TempSchedule unnamed = off("x", "", "2026-11-02", "2026-11-03");
        assertThat(TempRules.problems(off("new", "", "2026-11-03", "2026-11-03"), List.of(unnamed), TODAY, null))
                .containsExactly("These dates overlap Time off (Nov 2 – 3) on Nov 3. Edit Time off to change those days, or choose dates outside it.");
    }

    @Test
    void datesAcrossMonthsNameBothMonths() {
        assertThat(TempRules.range(LocalDate.of(2026, 11, 30), LocalDate.of(2026, 12, 4))).isEqualTo("Nov 30 – Dec 4");
    }

    @Test
    void missingBackwardsAndPastDatesAreRefusedInEachKindsWords() {
        TempSchedule noDates = new TempSchedule("n", TempSchedule.Kind.TIME_OFF, "", null, null, List.of(), Map.of());
        assertThat(TempRules.problems(noDates, List.of(), TODAY, null)).containsExactly("Time off needs a first and last day.");
        assertThat(TempRules.problems(off("n", "", "2026-10-27", "2026-10-26"), List.of(), TODAY, null)).containsExactly("The last day is before the first day.");
        assertThat(TempRules.problems(off("n", "", "2026-10-13", "2026-10-15"), List.of(), TODAY, null)).containsExactly("The first day off can’t be in the past.");
        assertThat(TempRules.problems(special("n", "", "2026-10-20", "2026-10-19", block(1, "", 9, 10)), List.of(), TODAY, null))
                .containsExactly("The end date is before the start date.");
    }

    @Test
    void anEditCanKeepAStartThatHasPassedButNotMoveOneThere() {
        TempSchedule running = special("camp", "Camp", "2026-10-12", "2026-10-16", block(1, "", 9, 10));
        assertThat(TempRules.problems(running, List.of(), TODAY, LocalDate.of(2026, 10, 12))).isEmpty();
        TempSchedule earlier = special("camp", "Camp", "2026-10-11", "2026-10-16", block(1, "", 9, 10));
        assertThat(TempRules.problems(earlier, List.of(), TODAY, LocalDate.of(2026, 10, 12))).containsExactly("The start date can’t be in the past.");
    }

    @Test
    void lengthsAreCappedForEachKind() {
        assertThat(TempRules.problems(special("n", "", "2026-11-01", "2026-12-01", block(1, "", 9, 10)), List.of(), TODAY, null)).isEmpty();
        assertThat(TempRules.problems(special("n", "", "2026-11-01", "2026-12-02", block(1, "", 9, 10)), List.of(), TODAY, null))
                .containsExactly("A special schedule can be at most 31 days.");
        assertThat(TempRules.problems(off("n", "", "2026-11-01", "2027-11-01"), List.of(), TODAY, null)).isEmpty();
        assertThat(TempRules.problems(off("n", "", "2026-11-01", "2027-11-02"), List.of(), TODAY, null))
                .containsExactly("Time off can be at most 366 days. Add another for the rest.");
    }

    @Test
    void aSpecialSchedulesBlocksAreCheckedAndAClashIsWordedForDates() {
        TempSchedule clash = special("n", "", "2026-11-02", "2026-11-03", block(1, "Morning ice", 6, 11), block(2, "", 10, 17));
        assertThat(TempRules.problems(clash, List.of(), TODAY, null))
                .containsExactly("On these dates, Morning ice (6–11 AM) and Block 2 (10 AM–5 PM) overlap in time.");
        TempSchedule noIce = special("n", "", "2026-11-02", "2026-11-03", new BlockTemplate(1, "", LocalTime.of(9, 0),
                LocalTime.of(10, 0), 60, 8000, 1, null, Set.of(DayOfWeek.MONDAY), Map.of()));
        assertThat(TempRules.problems(noIce, List.of(), TODAY, null)).containsExactly("Block 1 has no ice type. Pick one.");
    }

    @Test
    void aLongNameIsRefused() {
        assertThat(TempRules.problems(off("n", "x".repeat(41), "2026-11-02", "2026-11-03"), List.of(), TODAY, null))
                .containsExactly("The name can be up to 40 characters.");
    }
}
