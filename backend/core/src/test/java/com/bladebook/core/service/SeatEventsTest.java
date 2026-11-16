package com.bladebook.core.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThatCode;

class SeatEventsTest {

    @Test
    void noneDoesNothing() {
        assertThatCode(() -> SeatEvents.NONE.seatsChanged("coach", LocalDate.of(2026, 11, 16), LocalTime.of(6, 0)))
                .doesNotThrowAnyException();
    }
}
