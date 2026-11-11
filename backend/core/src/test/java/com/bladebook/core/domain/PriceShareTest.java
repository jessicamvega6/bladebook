package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A skater's share of a lesson's price, worked out and never stored: the total over {@code shareCount}, with
 * odd cents one each to the earliest skaters in {@code joinOrder} (ADR-031 decision 7).
 */
class PriceShareTest {

    @Test
    void aPrivateLessonIsTheWholePrice() {
        assertThat(PriceShare.of(5000, 1, List.of("ava"), "ava")).isEqualTo(5000);
    }

    @Test
    void anOpenTimeNobodyHasBookedCostsTheWholePrice() {
        assertThat(PriceShare.of(4501, 0, List.of(), "ava")).isEqualTo(4501);
    }

    @Test
    void theOwnersExample4501ForTwoIs2251And2250() {
        List<String> order = List.of("ava", "mia");
        assertThat(PriceShare.of(4501, 2, order, "ava")).isEqualTo(2251);
        assertThat(PriceShare.of(4501, 2, order, "mia")).isEqualTo(2250);
    }

    @Test
    void twoOddCentsGoToTheFirstTwoOfThree() {
        List<String> order = List.of("a", "b", "c");
        assertThat(PriceShare.of(5002, 3, order, "a")).isEqualTo(1668);
        assertThat(PriceShare.of(5002, 3, order, "b")).isEqualTo(1667);
        assertThat(PriceShare.of(5002, 3, order, "c")).isEqualTo(1667);
    }

    @Test
    void theSharesAlwaysAddUpToTheTotal() {
        List<String> order = List.of("a", "b", "c");
        for (int price : new int[] {0, 1, 2, 4999, 5000, 5001}) {
            int sum = order.stream().mapToInt(id -> PriceShare.of(price, 3, order, id)).sum();
            assertThat(sum).as("price %d", price).isEqualTo(price);
        }
    }

    @Test
    void aFreeLessonIsFreeForEveryone() {
        assertThat(PriceShare.of(0, 2, List.of("a", "b"), "b")).isZero();
    }

    @Test
    void aNegativePriceIsABug() {
        assertThatThrownBy(() -> PriceShare.of(-1, 1, List.of("a"), "a")).isInstanceOf(IllegalArgumentException.class);
    }
}
