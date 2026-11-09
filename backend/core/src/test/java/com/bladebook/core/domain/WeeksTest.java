package com.bladebook.core.domain;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import java.time.LocalDate;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

/** Sunday–Saturday weeks, the booking window and how far ahead lesson times are kept (ADR-MASTER sections 6–7). */
class WeeksTest {

    @TestFactory
    Stream<DynamicTest> weekStartFromTheSharedCases() {
        return StreamSupport.stream(ScheduleCases.section("weekStart").spliterator(), false)
                .map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () ->
                        assertThat(Weeks.sunday(LocalDate.parse(c.get("date").asString())))
                                .isEqualTo(LocalDate.parse(c.get("expect").asString()))));
    }

    @Test
    void theBookingWindowEndsWithTheMonthTwoMonthsAfterThisOne() {
        // ADR-MASTER section 7: on April 24 a family can book April, May and June.
        assertThat(Weeks.bookingWindowEnd(LocalDate.of(2027, 4, 24))).isEqualTo(LocalDate.of(2027, 6, 30));
        assertThat(Weeks.bookingWindowEnd(LocalDate.of(2026, 11, 1))).isEqualTo(LocalDate.of(2027, 1, 31));
        assertThat(Weeks.bookingWindowEnd(LocalDate.of(2026, 12, 31))).isEqualTo(LocalDate.of(2027, 2, 28));
    }

    @Test
    void lessonTimesAreKeptTwelveMonthsPastTheWindow() {
        assertThat(Weeks.storeUntil(LocalDate.of(2026, 11, 8))).isEqualTo(LocalDate.of(2028, 1, 31));
        assertThat(Weeks.storeUntil(LocalDate.of(2026, 12, 31))).isEqualTo(LocalDate.of(2028, 2, 29)); // a leap year
    }
}
