package com.bladebook.core.domain;

import com.bladebook.core.domain.BookingRequest.PickInput;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** What a family's booking request must be before anything is read or written. */
class BookingRequestTest {

    private static final String KEY = "6f1c2a8e-0b7d-4c55-9a51-3e2f8d7c1b09";

    private static BookingRequest.PickInput pick(String date, String time) {
        return new BookingRequest.PickInput(date, time);
    }

    @Test
    void picksAreParsedSortedAndDuplicatesDropped() {
        BookingRequest r = BookingRequest.parse("coach-1", "ava-1", KEY,
                List.of(pick("2026-11-18", "16:30"), pick("2026-11-16", "06:00"), pick("2026-11-18", "16:30")));
        assertThat(r.picks()).containsExactly(
                new BookingRequest.Pick(LocalDate.of(2026, 11, 16), LocalTime.of(6, 0)),
                new BookingRequest.Pick(LocalDate.of(2026, 11, 18), LocalTime.of(16, 30)));
        assertThat(r.idempotencyKey()).isEqualTo(KEY);
        assertThat(r.dates()).containsExactly(LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 18));
    }

    @Test
    void atLeastOnePick() {
        assertThatThrownBy(() -> BookingRequest.parse("coach-1", "ava-1", KEY, List.of()))
                .isInstanceOf(DomainException.class).hasMessage("Pick at least one time.");
        assertThatThrownBy(() -> BookingRequest.parse("coach-1", "ava-1", KEY, null))
                .isInstanceOf(DomainException.class).hasMessage("Pick at least one time.");
    }

    @Test
    void atMostFiftyPicks() {
        List<BookingRequest.PickInput> many = new ArrayList<>();
        LocalDate d = LocalDate.of(2026, 11, 16);
        for (int i = 0; i < 51; i++) {
            many.add(pick(d.plusDays(i).toString(), "06:00"));
        }
        assertThatThrownBy(() -> BookingRequest.parse("coach-1", "ava-1", KEY, many))
                .isInstanceOf(DomainException.class).hasMessage("Book up to 50 lessons at a time.");
        assertThat(BookingRequest.parse("coach-1", "ava-1", KEY, many.subList(0, 50)).picks()).hasSize(50);
    }

    @Test
    void aPickThatCantBeReadAsksForAReload() {
        for (BookingRequest.PickInput bad : List.of(pick("2026-13-01", "06:00"), pick("2026-11-16", "6am"),
                pick(null, "06:00"), pick("2026-11-16", null))) {
            assertThatThrownBy(() -> BookingRequest.parse("coach-1", "ava-1", KEY, List.of(bad)))
                    .isInstanceOf(DomainException.class).hasMessage("Something in your picks couldn’t be read. Reload the page and try again.");
        }
        List<BookingRequest.PickInput> withNull = new ArrayList<>();
        withNull.add(null);
        assertThatThrownBy(() -> BookingRequest.parse("coach-1", "ava-1", KEY, withNull)).isInstanceOf(DomainException.class);
    }

    @Test
    void theIdempotencyKeyIsRequiredAndSafe() {
        for (String bad : new String[] {null, "", "short", "has space in it 123", "a#b-c-d-e-f-g-h", "x".repeat(65)}) {
            assertThatThrownBy(() -> BookingRequest.parse("coach-1", "ava-1", bad, List.of(pick("2026-11-16", "06:00"))))
                    .as("key %s", bad).isInstanceOf(DomainException.class).hasMessage("Reload the page and try again.");
        }
    }

    private static BookingRequest repeating(Integer every, String until, PickInput... picks) {
        return BookingRequest.parse("coach", "ava", "key-12345678", List.of(picks), true, every, until);
    }

    @Test
    void aRepeatingPickBooksItsWeekdayEveryNWeeksUpToTheEndDate() {
        BookingRequest r = repeating(2, "2026-12-14", new PickInput("2026-11-16", "06:00"));
        assertThat(r.occurrences()).extracting(o -> o.date().toString())
                .containsExactly("2026-11-16", "2026-11-30", "2026-12-14");
        assertThat(r.occurrences()).allMatch(o -> o.intervalWeeks() == 2 && o.recurrenceId().equals(r.occurrences().get(0).recurrenceId()));
    }

    @Test
    void eachWeekdayAndTimeIsItsOwnSeriesAndTheIdFollowsTheKey() {
        BookingRequest r = repeating(1, "2026-11-25", new PickInput("2026-11-16", "06:00"), new PickInput("2026-11-18", "16:00"));
        assertThat(r.occurrences()).hasSize(4);
        assertThat(r.occurrences().stream().map(BookingRequest.Occurrence::recurrenceId).distinct()).hasSize(2);
        BookingRequest again = repeating(1, "2026-11-25", new PickInput("2026-11-16", "06:00"));
        assertThat(again.occurrences().get(0).recurrenceId()).isEqualTo(r.occurrences().get(0).recurrenceId());
        BookingRequest otherKey = BookingRequest.parse("coach", "ava", "key-87654321", List.of(new PickInput("2026-11-16", "06:00")), true, 1, "2026-11-25");
        assertThat(otherKey.occurrences().get(0).recurrenceId()).isNotEqualTo(r.occurrences().get(0).recurrenceId());
    }

    @Test
    void withoutRepeatEachPickIsOneDateWithNoSeries() {
        BookingRequest r = BookingRequest.parse("coach", "ava", "key-12345678", List.of(new PickInput("2026-11-16", "06:00")), false, 1, "2027-01-01");
        assertThat(r.repeat()).isNull();
        assertThat(r.occurrences()).singleElement().satisfies(o -> assertThat(o.recurrenceId()).isNull());
    }

    @Test
    void theEndDateMustBeThereAfterTheFirstPickAndWithinTwelveMonths() {
        PickInput six = new PickInput("2026-11-16", "06:00");
        assertThatThrownBy(() -> repeating(1, null, six)).hasMessage("Pick an end date.");
        assertThatThrownBy(() -> repeating(1, "soon", six)).hasMessage("Pick an end date.");
        assertThatThrownBy(() -> repeating(1, "2026-11-15", six)).hasMessage("The end date is before your first lesson.");
        assertThat(repeating(4, "2027-11-16", six).occurrences()).hasSize(14);
        assertThatThrownBy(() -> repeating(1, "2027-11-17", six)).hasMessage("A repeating booking can run up to 12 months.");
        assertThatThrownBy(() -> repeating(5, "2026-12-14", six)).hasMessage("Pick how often it repeats.");
        assertThatThrownBy(() -> repeating(0, "2026-12-14", six)).hasMessage("Pick how often it repeats.");
    }

    @Test
    void atMostThreeHundredDates() {
        PickInput[] seven = new PickInput[7];
        for (int i = 0; i < 7; i++) {
            seven[i] = new PickInput(java.time.LocalDate.of(2026, 11, 16).plusDays(i).toString(), "06:00");
        }
        assertThatThrownBy(() -> repeating(1, "2027-11-16", seven)).hasMessage("That’s more than 300 lessons. Pick an earlier end date.");
    }
}
