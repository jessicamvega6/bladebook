package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Changing a repeating booking only takes lessons away (ADR-MASTER section 10, "By the family"; ADR-009 d4b). */
class RecurrenceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 18); // a Wednesday
    private static final Recurrence WEEKLY = new Recurrence("coach", "r1", "ava", "park", DayOfWeek.WEDNESDAY, LocalTime.of(6, 30), 1,
            LocalDate.of(2026, 12, 23), LocalDate.of(2026, 11, 4), Recurrence.Status.ACTIVE);
    /** Wednesdays after today: Nov 25 to Dec 23. */
    private static final List<LocalDate> FUTURE = List.of(LocalDate.of(2026, 11, 25), LocalDate.of(2026, 12, 2), LocalDate.of(2026, 12, 9),
            LocalDate.of(2026, 12, 16), LocalDate.of(2026, 12, 23));

    @Test
    void theKeyNamesTheCoachAndSeries() {
        assertThat(WEEKLY.key()).isEqualTo("RECURRENCE#coach#r1");
    }

    @Test
    void stoppingCancelsEveryLessonStillToComeButNotToday() {
        assertThat(WEEKLY.cancels(Recurrence.Change.STOP, null, null, FUTURE, TODAY)).isEqualTo(FUTURE);
        assertThat(WEEKLY.after(Recurrence.Change.STOP, null, null).status()).isEqualTo(Recurrence.Status.ENDED);
    }

    @Test
    void endingEarlierCancelsTheDatesAfterTheNewLastDate() {
        assertThat(WEEKLY.cancels(Recurrence.Change.END_EARLIER, LocalDate.of(2026, 12, 9), null, FUTURE, TODAY))
                .containsExactly(LocalDate.of(2026, 12, 16), LocalDate.of(2026, 12, 23));
        assertThat(WEEKLY.after(Recurrence.Change.END_EARLIER, LocalDate.of(2026, 12, 9), null).endDate()).isEqualTo(LocalDate.of(2026, 12, 9));
    }

    @Test
    void theNewLastDateMustBeEarlierAndNotBeforeToday() {
        assertThatThrownBy(() -> WEEKLY.cancels(Recurrence.Change.END_EARLIER, LocalDate.of(2026, 12, 23), null, FUTURE, TODAY))
                .hasMessage("Pick a date before the current last lesson.");
        assertThatThrownBy(() -> WEEKLY.cancels(Recurrence.Change.END_EARLIER, LocalDate.of(2026, 11, 17), null, FUTURE, TODAY))
                .hasMessage("The new last date can’t be before today.");
        assertThat(WEEKLY.cancels(Recurrence.Change.END_EARLIER, TODAY, null, FUTURE, TODAY)).isEqualTo(FUTURE);
        assertThatThrownBy(() -> WEEKLY.cancels(Recurrence.Change.END_EARLIER, null, null, FUTURE, TODAY)).hasMessage("Pick a new last date.");
    }

    @Test
    void lessOftenKeepsTheFirstLessonStillToComeAndCountsFromIt() {
        assertThat(WEEKLY.cancels(Recurrence.Change.LESS_OFTEN, null, 2, FUTURE, TODAY))
                .containsExactly(LocalDate.of(2026, 12, 2), LocalDate.of(2026, 12, 16));
        assertThat(WEEKLY.cancels(Recurrence.Change.LESS_OFTEN, null, 3, FUTURE, TODAY))
                .containsExactly(LocalDate.of(2026, 12, 2), LocalDate.of(2026, 12, 9), LocalDate.of(2026, 12, 23));
        assertThat(WEEKLY.after(Recurrence.Change.LESS_OFTEN, null, 2).intervalWeeks()).isEqualTo(2);
    }

    @Test
    void lessOftenMeansLessOftenUpToEveryFourWeeks() {
        assertThatThrownBy(() -> WEEKLY.cancels(Recurrence.Change.LESS_OFTEN, null, 1, FUTURE, TODAY)).hasMessage("Pick a less frequent option.");
        assertThatThrownBy(() -> WEEKLY.cancels(Recurrence.Change.LESS_OFTEN, null, 5, FUTURE, TODAY)).hasMessage("Pick a less frequent option.");
        assertThat(WEEKLY.cancels(Recurrence.Change.LESS_OFTEN, null, 4, List.of(), TODAY)).isEmpty();
    }
}
