package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Field rules for the coach profile (ADR-MASTER section 4, ADR-016 d2 and d6). */
class ProfileRulesTest {

    // ---- names ----

    @Test
    void aNameIsTrimmed() {
        assertThat(ProfileRules.name("firstName", "  Dana ")).isEqualTo("Dana");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void aNameIsRequired(String name) {
        assertThatThrownBy(() -> ProfileRules.name("firstName", name))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("firstName");
    }

    @Test
    void aNameCanBeFiftyCharactersButNotFiftyOne() {
        assertThat(ProfileRules.name("lastName", "a".repeat(50))).hasSize(50);
        assertThatThrownBy(() -> ProfileRules.name("lastName", "a".repeat(51))).isInstanceOf(DomainException.class);
    }

    @Test
    void aNameCantHoldControlCharacters() {
        assertThatThrownBy(() -> ProfileRules.name("firstName", "Da\u0000na")).isInstanceOf(DomainException.class);
    }

    // ---- email ----

    @Test
    void anEmailIsTrimmedAndKeepsItsCase() {
        assertThat(ProfileRules.email("businessEmail", " Lessons@Dana.com ")).isEqualTo("Lessons@Dana.com");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"dana", "dana@", "@dana.com", "dana@dana", "da na@dana.com", "dana@dana..com", "a\n@b.com"})
    void aBadEmailIsRefused(String email) {
        assertThatThrownBy(() -> ProfileRules.email("businessEmail", email))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("businessEmail");
    }

    @Test
    void anEmailOver254CharactersIsRefused() {
        String local = "a".repeat(64);
        String domain = "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(58) + ".com";
        assertThatThrownBy(() -> ProfileRules.email("businessEmail", local + "@" + domain))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void sameAddressIgnoresCase() {
        assertThat(ProfileRules.sameAddress("Dana@Gmail.com", "dana@gmail.com")).isTrue();
        assertThat(ProfileRules.sameAddress("dana@gmail.com", "lessons@dana.com")).isFalse();
        assertThat(ProfileRules.sameAddress(null, "lessons@dana.com")).isFalse();
    }

    // ---- phone ----

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  "})
    void aPhoneIsOptional(String phone) {
        assertThat(ProfileRules.phone(phone)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"(205) 555-0142", "205-555-0142", "+1 205 555 0142", "205.555.0142"})
    void aPhoneInCommonShapesIsKept(String phone) {
        assertThat(ProfileRules.phone(phone)).isEqualTo(phone.trim());
    }

    @ParameterizedTest
    @ValueSource(strings = {"555-0142", "call me", "205 555 0142 x12", "+1 205 555 0142 0000 000"})
    void aPhoneWithTooFewDigitsTooManyOrLettersIsRefused(String phone) {
        assertThatThrownBy(() -> ProfileRules.phone(phone))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("phone");
    }

    // ---- time zone ----

    @ParameterizedTest
    @ValueSource(strings = {"America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
            "America/Toronto", "America/Edmonton", "America/Vancouver"})
    void theSevenOfferedTimeZonesAreAccepted(String zone) {
        assertThat(ProfileRules.timezone(zone)).isEqualTo(zone);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"Central — Chicago", "Europe/London", "america/chicago", "UTC"})
    void anyOtherTimeZoneIsRefused(String zone) {
        assertThatThrownBy(() -> ProfileRules.timezone(zone))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("coachTimezone");
    }

    // ---- currency ----

    @Test
    void currencyIsUsdOrCad() {
        assertThat(ProfileRules.currency("USD")).isEqualTo(CoachProfile.Currency.USD);
        assertThat(ProfileRules.currency("CAD")).isEqualTo(CoachProfile.Currency.CAD);
        assertThatThrownBy(() -> ProfileRules.currency("EUR")).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> ProfileRules.currency("usd")).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> ProfileRules.currency(null)).isInstanceOf(DomainException.class);
    }

    // ---- payment instructions ----

    @Test
    void instructionsAreOptionalAndTrimmed() {
        assertThat(ProfileRules.instructions(null)).isNull();
        assertThat(ProfileRules.instructions("  ")).isNull();
        assertThat(ProfileRules.instructions(" Cash at the rink.\nOr Venmo. ")).isEqualTo("Cash at the rink.\nOr Venmo.");
    }

    @Test
    void instructionsCanBeAThousandCharactersButNotMore() {
        assertThat(ProfileRules.instructions("a".repeat(1000))).hasSize(1000);
        assertThatThrownBy(() -> ProfileRules.instructions("a".repeat(1001)))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("paymentInstructions");
    }

    @Test
    void instructionsCantHoldControlCharactersOtherThanNewlines() {
        assertThatThrownBy(() -> ProfileRules.instructions("Pay\u0007me")).isInstanceOf(DomainException.class);
    }
}
