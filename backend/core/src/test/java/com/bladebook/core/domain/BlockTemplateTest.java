package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** One editor tab (ADR-008 decision 3). */
class BlockTemplateTest {

    @Test
    void nullDaysAndOffAreEmptyAndTheMapsAreCopied() {
        BlockTemplate t = new BlockTemplate(1, null, null, null, null, null, null, null, null, null);
        assertThat(t.days()).isEmpty();
        assertThat(t.off()).isEmpty();
        assertThat(t.name()).isEmpty();

        Map<DayOfWeek, Set<LocalTime>> off = new HashMap<>();
        off.put(DayOfWeek.MONDAY, Set.of(LocalTime.of(6, 0)));
        BlockTemplate u = new BlockTemplate(1, "", null, null, null, null, null, null, EnumSet.of(DayOfWeek.MONDAY), off);
        off.clear();
        assertThat(u.off()).containsKey(DayOfWeek.MONDAY);
    }

    @Test
    void emptySwitchedOffDaysAreDropped() {
        BlockTemplate t = new BlockTemplate(1, "", null, null, null, null, null, null, Set.of(), Map.of(DayOfWeek.MONDAY, Set.of()));
        assertThat(t.off()).isEmpty();
    }

    @Test
    void theLabelIsTheNameOrBlockN() {
        assertThat(new BlockTemplate(4, " Morning ice ", null, null, null, null, null, null, null, null).label()).isEqualTo("Morning ice");
        assertThat(new BlockTemplate(4, "  ", null, null, null, null, null, null, null, null).label()).isEqualTo("Block 4");
    }
}
