package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** A coach's day or week cancel as time off (owner, 2026-11-18, I24): what it does to the coach's dated schedules. */
class CoachCancelDaysTest {

    private static final LocalDate SUN = LocalDate.of(2026, 11, 15);
    private static final BlockTemplate MORNING = new BlockTemplate(1, "Camp ice", LocalTime.of(6, 0), LocalTime.of(7, 0), 30, 5000, 1,
            IceType.BFSC_FREESTYLE, Set.of(), Map.of());

    private static TempSchedule timeOff(String id, int from, int to) {
        return new TempSchedule(id, TempSchedule.Kind.TIME_OFF, "Vacation", SUN.plusDays(from), SUN.plusDays(to), List.of(), Map.of());
    }

    private static TempSchedule camp(int from, int to, Map<Integer, Map<LocalDate, Set<LocalTime>>> off) {
        return new TempSchedule("camp", TempSchedule.Kind.SPECIAL, "Camp", SUN.plusDays(from), SUN.plusDays(to), List.of(MORNING), off);
    }

    @Test
    void freeDatesBecomeTimeOffCalledCancelledOnePerRunOfDays() {
        // Sunday to Saturday, with a vacation on Tuesday and Wednesday: Sun-Mon and Thu-Sat.
        CoachCancelDays.Plan p = CoachCancelDays.plan(SUN, SUN.plusDays(6), List.of(timeOff("v", 2, 3)));
        assertThat(p.specials()).isEmpty();
        assertThat(p.newTimeOff()).extracting(TempSchedule::startDate, TempSchedule::endDate)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(SUN, SUN.plusDays(1)),
                        org.assertj.core.groups.Tuple.tuple(SUN.plusDays(4), SUN.plusDays(6)));
        assertThat(p.newTimeOff()).allSatisfy(t -> {
            assertThat(t.kind()).isEqualTo(TempSchedule.Kind.TIME_OFF);
            assertThat(t.name()).isEqualTo(CoachCancelDays.NAME);
            assertThat(t.tempId()).isNull();
        });
    }

    @Test
    void datesInASpecialScheduleHaveEveryTimeSwitchedOffAndTheRestStays() {
        TempSchedule c = camp(1, 3, Map.of(1, Map.of(SUN.plusDays(3), Set.of(LocalTime.of(6, 0)))));
        CoachCancelDays.Plan p = CoachCancelDays.plan(SUN.plusDays(2), SUN.plusDays(4), List.of(c));

        assertThat(p.newTimeOff()).extracting(TempSchedule::startDate).containsExactly(SUN.plusDays(4)); // after the camp
        assertThat(p.specials()).singleElement().satisfies(ch -> {
            assertThat(ch.before()).isEqualTo(c);
            TempSchedule after = ch.after();
            assertThat(after.tempId()).isEqualTo("camp");
            assertThat(after.startDate()).isEqualTo(SUN.plusDays(1));
            assertThat(after.endDate()).isEqualTo(SUN.plusDays(3));
            assertThat(after.off().get(1)).containsOnlyKeys(SUN.plusDays(2), SUN.plusDays(3));
            assertThat(after.off().get(1).get(SUN.plusDays(2))).containsExactlyInAnyOrder(LocalTime.of(6, 0), LocalTime.of(6, 30));
        });
    }

    @Test
    void datesAlreadyOffAndAnEmptyRangeChangeNothing() {
        assertThat(CoachCancelDays.plan(SUN.plusDays(2), SUN.plusDays(3), List.of(timeOff("v", 2, 3))).isEmpty()).isTrue();
        assertThat(CoachCancelDays.plan(SUN.plusDays(3), SUN.plusDays(2), List.of()).isEmpty()).isTrue();
        TempSchedule allOff = CoachCancelDays.switchOff(camp(1, 1, Map.of()), List.of(SUN.plusDays(1)));
        assertThat(CoachCancelDays.plan(SUN.plusDays(1), SUN.plusDays(1), List.of(allOff)).isEmpty()).isTrue();
    }
}
