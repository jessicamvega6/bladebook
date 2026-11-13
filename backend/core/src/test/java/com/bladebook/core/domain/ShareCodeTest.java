package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/** A skater's share code (ADR-MASTER section 3, "Share code"): {@code MIA-4K7QX}. */
class ShareCodeTest {

    @Test
    void startsWithTheFirstThreeLettersOfTheFirstName() {
        String code = ShareCode.generate("Mia Rossi", new Random(1));
        assertThat(code).matches("MIA-[ABCDEFGHJKMNPQRTVWXYZ2346789]{5}");
    }

    @Test
    void aShortFirstNameIsFilledFromTheLastName() {
        assertThat(ShareCode.prefix("Bo Li")).isEqualTo("BOL");
        assertThat(ShareCode.prefix("Al Bo")).isEqualTo("ALB");
    }

    @Test
    void accentsAreDroppedAndOtherCharactersSkipped() {
        assertThat(ShareCode.prefix("Zoë O'Neil")).isEqualTo("ZOE");
        assertThat(ShareCode.prefix("Éva-Marie Ng")).isEqualTo("EVA");
        assertThat(ShareCode.prefix("J. R. Smith")).isEqualTo("JRS");
    }

    @Test
    void aNameWithTooFewLettersIsPaddedSoTheShapeHolds() {
        assertThat(ShareCode.prefix("Jo")).hasSize(3).startsWith("JO");
        assertThat(ShareCode.prefix("李")).hasSize(3);
    }

    @Test
    void twoDrawsDifferInTheRandomPart() {
        Random r = new Random(7);
        assertThat(ShareCode.generate("Mia Rossi", r)).isNotEqualTo(ShareCode.generate("Mia Rossi", r));
    }

    @Test
    void typedIgnoringCaseAndTheDash() {
        assertThat(ShareCode.normalise("mia-4k7qx")).contains("MIA-4K7QX");
        assertThat(ShareCode.normalise(" MIA4K7QX ")).contains("MIA-4K7QX");
        assertThat(ShareCode.normalise("Mia 4K7 QX")).contains("MIA-4K7QX");
    }

    @Test
    void theWrongShapeIsNoCode() {
        assertThat(ShareCode.normalise(null)).isEmpty();
        assertThat(ShareCode.normalise("")).isEmpty();
        assertThat(ShareCode.normalise("MIA-4K7Q")).isEmpty();          // too short
        assertThat(ShareCode.normalise("MIA-4K7QXX")).isEmpty();        // too long
        assertThat(ShareCode.normalise("MI4-4K7QX")).isEmpty();         // a digit in the name part
        assertThat(ShareCode.normalise("MIA-4K7Q0")).isEqualTo(Optional.empty()); // 0 isn't in the set
        assertThat(ShareCode.normalise("MIA-4K7Q#")).isEmpty();
    }

    @Test
    void aCoachCodeIsNeverAShareCode() {
        assertThat(ShareCode.normalise("7K2Q-M9XT")).isEmpty();
    }
}
