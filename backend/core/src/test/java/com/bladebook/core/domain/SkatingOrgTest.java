package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The three Phase 1 organisations (ADR-029 decision 2, Learn to Skate USA added 2026-10-16). */
class SkatingOrgTest {

    @Test
    void parsesTheStoredName() {
        assertThat(SkatingOrg.parse("LEARN_TO_SKATE_USA")).isEqualTo(SkatingOrg.LEARN_TO_SKATE_USA);
    }

    @Test
    void anUnknownOrMissingOrganisationIsInvalid() {
        assertThatThrownBy(() -> SkatingOrg.parse("SKATE_CANADA"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("skatingOrg"));
        assertThatThrownBy(() -> SkatingOrg.parse(null)).isInstanceOf(DomainException.class);
    }

    @Test
    void onlyUsaHockeyCallsItARegistrationNumber() {
        assertThat(SkatingOrg.USA_HOCKEY.numberName()).isEqualTo("registration number");
        assertThat(SkatingOrg.USFS.numberName()).isEqualTo("member number");
    }
}
