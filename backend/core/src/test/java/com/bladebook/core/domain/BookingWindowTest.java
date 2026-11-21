package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The booking window: today through the end of the month two months ahead, in the coach's time zone
 * (ADR-031 decision 3; FeatureDecriptions/Bookings:, "its April 24th, so the months shown would be April, May, June").
 */
class BookingWindowTest {

    private static final ZoneId CHICAGO = ZoneId.of("America/Chicago");

    @Test
    void theOwnersExampleApril24ShowsAprilMayAndJune() {
        BookingWindow w = BookingWindow.of(LocalDate.of(2027, 4, 24));
        assertThat(w.first()).isEqualTo(LocalDate.of(2027, 4, 24));
        assertThat(w.last()).isEqualTo(LocalDate.of(2027, 6, 30));
    }

    @Test
    void theEdgesAreInsideAndTheDaysPastThemAreNot() {
        BookingWindow w = BookingWindow.of(LocalDate.of(2026, 11, 10));
        assertThat(w.contains(LocalDate.of(2026, 11, 10))).isTrue();
        assertThat(w.contains(LocalDate.of(2027, 1, 31))).isTrue();
        assertThat(w.contains(LocalDate.of(2026, 11, 9))).isFalse();
        assertThat(w.contains(LocalDate.of(2027, 2, 1))).isFalse();
    }

    @Test
    void theLastDayIsTheMonthsRealLastDayInShortMonthsAndLeapYears() {
        assertThat(BookingWindow.of(LocalDate.of(2026, 12, 31)).last()).isEqualTo(LocalDate.of(2027, 2, 28));
        assertThat(BookingWindow.of(LocalDate.of(2027, 12, 1)).last()).isEqualTo(LocalDate.of(2028, 2, 29));
        assertThat(BookingWindow.of(LocalDate.of(2026, 1, 31)).last()).isEqualTo(LocalDate.of(2026, 3, 31));
    }

    @Test
    void todayIsTheCoachsToday() {
        // 11:30 PM on Nov 30 in Chicago is already Dec 1 in UTC.
        Instant lateEvening = Instant.parse("2026-12-01T05:30:00Z");
        BookingWindow w = BookingWindow.at(lateEvening, CHICAGO);
        assertThat(w.first()).isEqualTo(LocalDate.of(2026, 11, 30));
        assertThat(w.last()).isEqualTo(LocalDate.of(2027, 1, 31));

        // Half an hour later it's Dec 1 for the coach too, and the window reaches the end of February.
        assertThat(BookingWindow.at(Instant.parse("2026-12-01T06:00:00Z"), CHICAGO).last()).isEqualTo(LocalDate.of(2027, 2, 28));
    }

    @Test
    void theWindowOnlyGrowsSoARetryIsNeverRefused() {
        LocalDate pick = LocalDate.of(2027, 1, 31);
        assertThat(BookingWindow.of(LocalDate.of(2026, 11, 30)).contains(pick)).isTrue();
        assertThat(BookingWindow.of(LocalDate.of(2026, 12, 1)).contains(pick)).isTrue();
    }

    @Test
    void everyPickInsideIsAccepted() {
        BookingWindow.of(LocalDate.of(2026, 11, 10)).requireAll(List.of(LocalDate.of(2026, 11, 10), LocalDate.of(2027, 1, 31)));
    }

    @Test
    void onePickPastTheEndRefusesTheWholeRequestWithTheProductWording() {
        BookingWindow w = BookingWindow.of(LocalDate.of(2026, 11, 10));
        assertThatThrownBy(() -> w.requireAll(List.of(LocalDate.of(2026, 11, 12), LocalDate.of(2027, 2, 1))))
                .isInstanceOf(DomainException.class)
                .hasMessage("That date is further ahead than you can book.")
                .extracting(e -> ((DomainException) e).reason()).isEqualTo(DomainException.Reason.INVALID);
    }

    @Test
    void aPickBeforeTodayIsRefusedToo() {
        BookingWindow w = BookingWindow.of(LocalDate.of(2026, 11, 10));
        assertThatThrownBy(() -> w.requireAll(List.of(LocalDate.of(2026, 11, 9))))
                .isInstanceOf(DomainException.class)
                .hasMessage("That date has already passed.");
    }
}
