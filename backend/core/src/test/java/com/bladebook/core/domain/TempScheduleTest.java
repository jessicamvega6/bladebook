package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TempScheduleTest {

    private static final LocalDate MON = LocalDate.of(2026, 12, 21);
    private static final LocalDate TUE = MON.plusDays(1);

    private static TempSchedule camp(Map<Integer, Map<LocalDate, Set<LocalTime>>> off) {
        BlockTemplate ice = new BlockTemplate(5, "Camp ice", LocalTime.of(9, 0), LocalTime.of(12, 0), 60, 8000, 1, IceType.BFSC_FREESTYLE,
                Set.of(), Map.of());
        return new TempSchedule("camp", TempSchedule.Kind.SPECIAL, " Holiday camp ", MON, MON.plusDays(6), List.of(ice), off);
    }

    @Test
    void timeOffHasNoLessonsOnAnyOfItsDates() {
        TempSchedule off = new TempSchedule("tg", TempSchedule.Kind.TIME_OFF, "", MON, TUE, List.of(), Map.of());
        assertThat(off.dateBlocks()).containsOnlyKeys(MON, TUE);
        assertThat(off.blocksOn(MON)).isEmpty();
        assertThat(off.displayName()).isEqualTo("Time off");
        assertThat(off.key()).isEqualTo("SCHEDULE#TEMP#tg");
    }

    @Test
    void aSpecialSchedulesBlocksApplyToEveryDateAndATimeSwitchedOffIsOffOnThatDateOnly() {
        TempSchedule c = camp(Map.of(5, Map.of(TUE, Set.of(LocalTime.of(10, 0)))));
        assertThat(c.blocksOn(MON)).extracting(ScheduleBlock::startTime, ScheduleBlock::endTime)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(LocalTime.of(9, 0), LocalTime.of(12, 0)));
        assertThat(c.blocksOn(TUE)).extracting(ScheduleBlock::startTime, ScheduleBlock::endTime).containsExactly(
                org.assertj.core.groups.Tuple.tuple(LocalTime.of(9, 0), LocalTime.of(10, 0)),
                org.assertj.core.groups.Tuple.tuple(LocalTime.of(11, 0), LocalTime.of(12, 0)));
        assertThat(c.blocksOn(MON).get(0).priceMinor()).isEqualTo(8000);
        assertThat(c.dates()).hasSize(7);
        assertThat(c.displayName()).isEqualTo("Holiday camp");
    }

    @Test
    void coversAndOverlapUseWholeDates() {
        TempSchedule c = camp(Map.of());
        assertThat(c.covers(MON)).isTrue();
        assertThat(c.covers(MON.plusDays(7))).isFalse();
        TempSchedule later = new TempSchedule("x", TempSchedule.Kind.TIME_OFF, "", MON.plusDays(6), MON.plusDays(9), List.of(), Map.of());
        assertThat(c.overlap(later)).containsExactly(MON.plusDays(6), MON.plusDays(6));
        TempSchedule apart = new TempSchedule("y", TempSchedule.Kind.TIME_OFF, "", MON.plusDays(7), MON.plusDays(9), List.of(), Map.of());
        assertThat(c.overlap(apart)).isNull();
    }

    @Test
    void emptyOffListsAreDropped() {
        assertThat(camp(Map.of(5, Map.of(TUE, Set.of()))).off()).isEmpty();
    }
}
