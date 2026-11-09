package com.bladebook.core.domain;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.TUESDAY;
import static java.time.DayOfWeek.WEDNESDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Block templates → the stored per-day blocks, validation, and back (ADR-008 decisions 2a, 3, 4 and 8). */
class ScheduleRulesTest {

    // ------------------------------------------------------------ shared cases

    @TestFactory
    Stream<DynamicTest> templatesBecomeBlocks() {
        return StreamSupport.stream(ScheduleCases.section("templateBlocks").spliterator(), false)
                .map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
                    Map<DayOfWeek, List<ScheduleBlock>> days = ScheduleRules.blocks(ScheduleCases.templates(c.get("templates")));
                    JsonNode expect = c.get("expect");
                    List<String> want = new ArrayList<>();
                    for (Map.Entry<String, JsonNode> e : expect.properties()) {
                        for (JsonNode b : e.getValue()) {
                            want.add(ScheduleCases.day(Integer.parseInt(e.getKey())) + " " + b.get("seq").asInt() + " "
                                    + b.get("startTime").asString() + "-" + b.get("endTime").asString());
                        }
                    }
                    List<String> got = new ArrayList<>();
                    for (DayOfWeek d : DayOfWeek.values()) {
                        for (ScheduleBlock b : days.getOrDefault(d, List.of())) {
                            got.add(d + " " + b.seq() + " " + b.startTime() + "-" + b.endTime());
                        }
                    }
                    assertThat(got).containsExactlyInAnyOrderElementsOf(want);
                }));
    }

    @TestFactory
    Stream<DynamicTest> validation() {
        return StreamSupport.stream(ScheduleCases.section("validation").spliterator(), false)
                .map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () ->
                        assertThat(ScheduleRules.problems(ScheduleCases.templates(c.get("templates"))))
                                .containsExactlyElementsOf(ScheduleCases.strings(c.get("expect")))));
    }

    // -------------------------------------------------------------- the rest

    private static BlockTemplate morning() {
        return new BlockTemplate(1, "Morning ice", LocalTime.of(6, 0), LocalTime.of(8, 0), 30, 5000, 2,
                IceType.BFSC_FREESTYLE, EnumSet.of(MONDAY, WEDNESDAY), Map.of(MONDAY, Set.of(LocalTime.of(7, 0))));
    }

    private static BlockTemplate power() {
        return new BlockTemplate(3, "", LocalTime.of(15, 0), LocalTime.of(17, 0), 60, 8000, 1,
                IceType.PUBLIC, EnumSet.of(MONDAY), Map.of());
    }

    @Test
    void blocksCarryEveryStampFromTheirTemplate() {
        ScheduleBlock b = ScheduleRules.blocks(List.of(morning())).get(WEDNESDAY).get(0);
        assertThat(b).isEqualTo(new ScheduleBlock(1, "Morning ice", LocalTime.of(6, 0), LocalTime.of(8, 0), 30, 5000, 0, 2,
                IceType.BFSC_FREESTYLE));
    }

    @Test
    void aBlankNameIsStoredAsNoName() {
        ScheduleBlock b = ScheduleRules.blocks(List.of(power())).get(MONDAY).get(0);
        assertThat(b.blockName()).isNull();
    }

    @Test
    void eachDaysBlocksAreInTimeOrder() {
        List<ScheduleBlock> monday = ScheduleRules.blocks(List.of(power(), morning())).get(MONDAY);
        assertThat(monday).extracting(ScheduleBlock::startTime)
                .containsExactly(LocalTime.of(6, 0), LocalTime.of(7, 30), LocalTime.of(15, 0));
    }

    @Test
    void toWeeklyRefusesAnInvalidScheduleWithEveryProblem() {
        BlockTemplate clash = new BlockTemplate(2, "", LocalTime.of(7, 0), LocalTime.of(9, 0), 30, 5000, 1,
                null, EnumSet.of(MONDAY), Map.of());
        assertThatThrownBy(() -> ScheduleRules.toWeekly(List.of(morning(), clash), 0))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.reason()).isEqualTo(DomainException.Reason.INVALID);
                    assertThat(e.field()).isEqualTo("blocks");
                    assertThat(e.getMessage()).isEqualTo("Block 2 has no ice type. Pick one.\n"
                            + "Monday: Morning ice (6–8 AM) and Block 2 (7–9 AM) overlap in time.");
                });
    }

    @Test
    void twoTemplatesCantShareASeq() {
        BlockTemplate twin = new BlockTemplate(1, "", LocalTime.of(15, 0), LocalTime.of(16, 0), 30, 5000, 1,
                IceType.PUBLIC, EnumSet.of(TUESDAY), Map.of());
        assertThat(ScheduleRules.problems(List.of(morning(), twin))).contains("Two blocks have the same number. Reload the page and try again.");
    }

    @Test
    void aSeqMustBePositive() {
        BlockTemplate zero = new BlockTemplate(0, "", LocalTime.of(15, 0), LocalTime.of(16, 0), 30, 5000, 1,
                IceType.PUBLIC, EnumSet.of(TUESDAY), Map.of());
        assertThat(ScheduleRules.problems(List.of(zero))).contains("Two blocks have the same number. Reload the page and try again.");
    }

    @Test
    void aNameWithAControlCharacterIsRefused() {
        BlockTemplate t = new BlockTemplate(1, "Morn\u0007ing", LocalTime.of(6, 0), LocalTime.of(8, 0), 30, 5000, 1,
                IceType.PUBLIC, EnumSet.of(MONDAY), Map.of());
        assertThat(ScheduleRules.problems(List.of(t))).containsExactly("A block name has a character it can’t hold.");
    }

    @Test
    void theRoundTripRebuildsEachTemplateWithItsDaysAndSwitchedOffSlots() {
        WeeklySchedule weekly = ScheduleRules.toWeekly(List.of(power(), morning()), 4);
        assertThat(weekly.scheduleVersion()).isEqualTo(4);

        List<BlockTemplate> back = ScheduleRules.fromWeekly(weekly);

        assertThat(back).containsExactly(morning(), power()); // ordered by seq
    }

    @Test
    void theRoundTripTrimsAnUnevenEndAndADayWithEverySlotOff() {
        BlockTemplate uneven = new BlockTemplate(1, "", LocalTime.of(6, 0), LocalTime.of(11, 30), 45, 5000, 1,
                IceType.PUBLIC, EnumSet.of(MONDAY, TUESDAY),
                Map.of(TUESDAY, Set.of(LocalTime.of(6, 0), LocalTime.of(6, 45), LocalTime.of(7, 30), LocalTime.of(8, 15),
                        LocalTime.of(9, 0), LocalTime.of(9, 45), LocalTime.of(10, 30))));

        List<BlockTemplate> back = ScheduleRules.fromWeekly(ScheduleRules.toWeekly(List.of(uneven), 1));

        assertThat(back).containsExactly(new BlockTemplate(1, "", LocalTime.of(6, 0), LocalTime.of(11, 15), 45, 5000, 1,
                IceType.PUBLIC, EnumSet.of(MONDAY), Map.of()));
    }

    @Test
    void anEmptyWeekHasNoTemplates() {
        assertThat(ScheduleRules.fromWeekly(new WeeklySchedule(Map.of(), 2))).isEmpty();
    }

    @Test
    void theNextSeqIsOneAboveTheHighest() {
        assertThat(ScheduleRules.nextSeq(List.of(morning(), power()))).isEqualTo(4);
        assertThat(ScheduleRules.nextSeq(List.of())).isEqualTo(1);
    }

    @Test
    void timeRangesDropTheFirstMeridiemWhenBothMatch() {
        assertThat(ScheduleRules.range(LocalTime.of(6, 0), LocalTime.of(11, 30))).isEqualTo("6–11:30 AM");
        assertThat(ScheduleRules.range(LocalTime.of(10, 0), LocalTime.of(17, 0))).isEqualTo("10 AM–5 PM");
        assertThat(ScheduleRules.range(LocalTime.of(0, 0), LocalTime.of(0, 30))).isEqualTo("12–12:30 AM");
    }
}
