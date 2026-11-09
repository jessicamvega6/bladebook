package com.bladebook.core.domain;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

/** Slot expansion (ADR-008 decision 4, ADR-MASTER section 6), from the shared cases. */
class SlotsTest {

    @TestFactory
    Stream<DynamicTest> sharedCases() {
        return StreamSupport.stream(ScheduleCases.section("slotExpansion").spliterator(), false)
                .map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
                    List<LocalTime> slots = Slots.expand(
                            ScheduleCases.time(c.get("startTime")),
                            ScheduleCases.time(c.get("endTime")),
                            ScheduleCases.integer(c.get("lessonMinutes")));
                    List<String> shown = new ArrayList<>();
                    slots.forEach(t -> shown.add(t.toString()));
                    assertThat(shown).containsExactlyElementsOf(ScheduleCases.strings(c.get("expect")));
                }));
    }

    @Test
    void theLastSlotCanEndAtExactly1145Pm() {
        assertThat(Slots.expand(LocalTime.of(23, 15), LocalTime.of(23, 45), 30)).containsExactly(LocalTime.of(23, 15));
    }

    @Test
    void minutesOfDayRoundTrip() {
        assertThat(Slots.minutes(LocalTime.of(6, 45))).isEqualTo(405);
        assertThat(Slots.time(405)).isEqualTo(LocalTime.of(6, 45));
    }

    @Test
    void sharedCasesExist() {
        assertThat(ScheduleCases.section("slotExpansion").size()).isGreaterThan(5);
        JsonNode first = ScheduleCases.section("slotExpansion").get(0);
        assertThat(first.has("expect")).isTrue();
    }
}
