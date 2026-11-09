package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pelham Civic Center's ice types (ADR-MASTER section 6). */
class IceTypeTest {

    @Test
    void parsesTheStoredName() {
        assertThat(IceType.parse("STICK_AND_PUCK")).isEqualTo(IceType.STICK_AND_PUCK);
    }

    @Test
    void blankIsNoIceType() {
        assertThat(IceType.parse(null)).isNull();
        assertThat(IceType.parse("")).isNull();
    }

    @Test
    void anUnknownNameIsInvalid() {
        assertThatThrownBy(() -> IceType.parse("OUTDOOR"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("iceType"));
    }
}
