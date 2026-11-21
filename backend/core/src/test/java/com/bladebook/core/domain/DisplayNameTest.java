package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A skater's display form on seats and in the coach's week view: "Mia R." (ADR-MASTER sections 7 and 8). */
class DisplayNameTest {

    @Test
    void firstNameAndTheLastNamesInitial() {
        assertThat(DisplayName.of("Mia Rodriguez")).isEqualTo("Mia R.");
    }

    @Test
    void aMiddleNameIsLeftOut() {
        assertThat(DisplayName.of("Mary Ann Lee")).isEqualTo("Mary L.");
    }

    @Test
    void oneNameStaysAsItIs() {
        assertThat(DisplayName.of("Cher")).isEqualTo("Cher");
    }

    @Test
    void extraSpacesDontMatterAndTheInitialIsUpperCase() {
        assertThat(DisplayName.of("  ava   park ")).isEqualTo("ava P.");
    }
}
