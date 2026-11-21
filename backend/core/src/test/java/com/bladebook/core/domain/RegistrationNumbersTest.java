package com.bladebook.core.domain;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The skater's registration number, checked for shape only (ADR-029 decision 4, amended 2026-11-06). */
class RegistrationNumbersTest {

    private static final RegistrationNumbers NO_SEASON_CHECK = RegistrationNumbers.withoutSeasonCheck();

    /** registration-number-cases.json at the repository root, shared with the web's tests (ADR-013 d3b). */
    @TestFactory
    List<DynamicTest> sharedCases() {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : load().get("cases")) {
            SkatingOrg org = SkatingOrg.parse(c.get("org").asString());
            String typed = c.get("typed").asString();
            JsonNode expect = c.get("expect");
            tests.add(DynamicTest.dynamicTest(c.get("name").asString(), () -> {
                if (expect.has("number")) {
                    assertThat(NO_SEASON_CHECK.clean(org, typed)).isEqualTo(expect.get("number").asString());
                } else {
                    assertThatThrownBy(() -> NO_SEASON_CHECK.clean(org, typed))
                            .isInstanceOfSatisfying(DomainException.class, e -> {
                                assertThat(e.getMessage()).isEqualTo(expect.get("problem").asString());
                                assertThat(e.field()).isEqualTo("registrationNumber");
                            });
                }
            }));
        }
        assertThat(tests).hasSizeGreaterThan(10);
        return tests;
    }

    @Test
    void theSeasonCheckDigitIsASetting() {
        // 2027KQ4815MX3T: the digits in order are 2 0 2 7 4 8 1 5 3, so the 4th digit is 7.
        RegistrationNumbers seventh = RegistrationNumbers.withSeasonCheck(4, 7);
        assertThat(seventh.clean(SkatingOrg.USA_HOCKEY, "2027KQ4815MX3T")).isEqualTo("2027KQ4815MX3T");

        RegistrationNumbers sixth = RegistrationNumbers.withSeasonCheck(4, 6);
        assertThatThrownBy(() -> sixth.clean(SkatingOrg.USA_HOCKEY, "2027KQ4815MX3T"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.getMessage())
                        .isEqualTo("That isn’t this season’s USA Hockey number. Check the skater’s current card."));
    }

    @Test
    void theSeasonCheckLeavesOtherOrganisationsAlone() {
        assertThat(RegistrationNumbers.withSeasonCheck(4, 6).clean(SkatingOrg.USFS, "1234567")).isEqualTo("1234567");
    }

    @Test
    void aSeasonCheckOutsideTheNineDigitsIsRefusedAtStart() {
        assertThatThrownBy(() -> RegistrationNumbers.withSeasonCheck(10, 6)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RegistrationNumbers.withSeasonCheck(1, 10)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aMissingOrganisationIsInvalid() {
        assertThatThrownBy(() -> NO_SEASON_CHECK.clean(null, "1234567"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("skatingOrg"));
    }

    private static JsonNode load() {
        Path dir = Path.of("").toAbsolutePath();
        while (dir != null) {
            Path f = dir.resolve("registration-number-cases.json");
            if (Files.exists(f)) {
                return JsonMapper.builder().build().readTree(f.toFile());
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException("registration-number-cases.json not found");
    }
}
