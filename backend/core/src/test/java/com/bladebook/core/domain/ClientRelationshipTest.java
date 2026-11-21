package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@code clientRelationship} (ADR-MASTER section 3, Enumerations). */
class ClientRelationshipTest {

    @Test
    void parsesTheStoredName() {
        assertThat(ClientRelationship.parse("SELF")).isEqualTo(ClientRelationship.SELF);
        assertThat(ClientRelationship.parse("GUARDIAN")).isEqualTo(ClientRelationship.GUARDIAN);
    }

    @Test
    void blankOrUnknownIsInvalid() {
        assertThatThrownBy(() -> ClientRelationship.parse(null))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.field()).isEqualTo("relationship");
                    assertThat(e.getMessage()).isEqualTo("Choose who the lessons are for.");
                });
        assertThatThrownBy(() -> ClientRelationship.parse("PARENT")).isInstanceOf(DomainException.class);
    }
}
