package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Random;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** ADR-MASTER section 4, Coach code. */
class CoachCodeTest {

    // ---- generate ----

    @Test
    void generatesEightCharactersFromTheSetWithNoLookAlikes() {
        Random random = new Random(42);
        for (int i = 0; i < 500; i++) {
            String value = CoachCode.generate(random).value();
            assertThat(value).hasSize(8);
            assertThat(value.chars()).allMatch(c -> CoachCode.ALPHABET.indexOf(c) >= 0);
        }
    }

    @Test
    void theSetLeavesOutEveryLookAlike() {
        assertThat(CoachCode.ALPHABET).doesNotContain("0", "O", "1", "I", "L", "5", "S", "U");
        assertThat(CoachCode.ALPHABET).hasSize(28);
    }

    @Test
    void generatedCodesUseTheWholeSet() {
        Random random = new Random(7);
        Set<Character> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            for (char c : CoachCode.generate(random).value().toCharArray()) {
                seen.add(c);
            }
        }
        assertThat(seen).hasSize(CoachCode.ALPHABET.length());
    }

    @Test
    void twoGeneratedCodesDiffer() {
        SecureRandom random = new SecureRandom();
        assertThat(CoachCode.generate(random)).isNotEqualTo(CoachCode.generate(random));
    }

    // ---- display ----

    @Test
    void isShownAsTwoGroupsOfFour() {
        CoachCode code = CoachCode.parse("7K2QM9XT");
        assertThat(code.display()).isEqualTo("7K2Q-M9XT");
        assertThat(code.toString()).isEqualTo("7K2Q-M9XT");
    }

    // ---- parse: normalise ----

    @Test
    void acceptsTheDashedForm() {
        assertThat(CoachCode.parse("7K2Q-M9XT").value()).isEqualTo("7K2QM9XT");
    }

    @Test
    void acceptsAnyCase() {
        assertThat(CoachCode.parse("7k2q-m9xt").value()).isEqualTo("7K2QM9XT");
    }

    @Test
    void ignoresSpacesAroundAndInside() {
        assertThat(CoachCode.parse("  7k2q m9xt ").value()).isEqualTo("7K2QM9XT");
    }

    @Test
    void codesThatNormaliseTheSameAreEqual() {
        assertThat(CoachCode.parse("7k2q-m9xt")).isEqualTo(CoachCode.parse("7K2QM9XT"))
                .hasSameHashCodeAs(CoachCode.parse("7K2QM9XT"));
    }

    // ---- parse: reject ----

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "-"})
    void rejectsNothingTyped(String typed) {
        assertThatThrownBy(() -> CoachCode.parse(typed))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.INVALID);
    }

    @ParameterizedTest
    @ValueSource(strings = {"7K2Q-M9X", "7K2QM9XTA", "7K2", "7K2Q-M9XT-7K2Q"})
    void rejectsTheWrongLength(String typed) {
        assertThatThrownBy(() -> CoachCode.parse(typed)).isInstanceOf(DomainException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"7K2Q-M9X0", "OK2Q-M9XT", "7K2Q-M9X1", "IK2Q-M9XT", "LK2Q-M9XT", "5K2Q-M9XT", "SK2Q-M9XT", "UK2Q-M9XT", "7K2Q_M9XT", "7K2Q-M9X!"})
    void rejectsCharactersOutsideTheSet(String typed) {
        assertThatThrownBy(() -> CoachCode.parse(typed)).isInstanceOf(DomainException.class);
    }

    @Test
    void theErrorNeverEchoesWhatWasTyped() {
        assertThatThrownBy(() -> CoachCode.parse("SECRET99"))
                .isInstanceOf(DomainException.class)
                .hasMessageNotContaining("SECRET99");
    }
}
