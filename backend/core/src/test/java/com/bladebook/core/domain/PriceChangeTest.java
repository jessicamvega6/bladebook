package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** The big price change warning: 50% or more of the old price, up or down (settled 2026-10-13). */
class PriceChangeTest {

    @Test
    void theDesignsExamples() {
        assertThat(PriceChange.isBig(6000, 600)).isTrue();   // a 90% cut
        assertThat(PriceChange.isBig(5000, 7500)).isTrue();  // a 50% rise
        assertThat(PriceChange.isBig(5000, 6000)).isFalse(); // 20%
    }

    @Test
    void exactlyFiftyPercentWarnsAndJustUnderDoesnt() {
        assertThat(PriceChange.isBig(5000, 2500)).isTrue();
        assertThat(PriceChange.isBig(5000, 2501)).isFalse();
        assertThat(PriceChange.isBig(5000, 7499)).isFalse();
        assertThat(PriceChange.isBig(4501, 2250)).isTrue();  // odd cents: 50.01% down
    }

    @Test
    void aFreeBlockNeverWarnsAndNoChangeNeverWarns() {
        assertThat(PriceChange.isBig(0, 5000)).isFalse();
        assertThat(PriceChange.isBig(0, 0)).isFalse();
        assertThat(PriceChange.isBig(5000, 5000)).isFalse();
    }

    @Test
    void droppingToZeroIsAHundredPercentCut() {
        PriceChange c = new PriceChange(1, "Morning ice", 5000, 0);
        assertThat(PriceChange.isBig(5000, 0)).isTrue();
        assertThat(c.percent()).isEqualTo(100);
        assertThat(c.cut()).isTrue();
    }

    @Test
    void thePercentIsRounded() {
        assertThat(new PriceChange(1, "x", 6000, 600).percent()).isEqualTo(90);
        assertThat(new PriceChange(1, "x", 3000, 4999).percent()).isEqualTo(67);
    }

    private static BlockTemplate block(int seq, String name, Integer price) {
        return new BlockTemplate(seq, name, LocalTime.of(6, 0), LocalTime.of(8, 0), 30, price, 1, IceType.PUBLIC,
                Set.of(java.time.DayOfWeek.MONDAY), Map.of());
    }

    @Test
    void blocksAreMatchedByTheirNumberAndANewBlockHasNothingToCompare() {
        List<PriceChange> big = PriceChange.big(List.of(block(1, "Morning ice", 6000), block(2, "", 8000)),
                List.of(block(1, "Morning ice", 600), block(2, "", 8500), block(3, "", 100)));
        assertThat(big).containsExactly(new PriceChange(1, "Morning ice", 6000, 600));
    }

    @Test
    void anUnnamedBlockIsLabelledByItsNumber() {
        assertThat(PriceChange.big(List.of(block(2, "", 5000)), List.of(block(2, "", 9000))))
                .extracting(PriceChange::label).containsExactly("Block 2");
    }
}
