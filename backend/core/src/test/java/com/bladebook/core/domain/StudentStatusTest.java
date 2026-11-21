package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@code studentStatus} (ADR-MASTER section 3, Enumerations). */
class StudentStatusTest {

    @Test
    void parsesTheStoredName() {
        assertThat(StudentStatus.parse("ACTIVE")).isEqualTo(StudentStatus.ACTIVE);
        assertThat(StudentStatus.parse("PENDING")).isEqualTo(StudentStatus.PENDING);
    }

    @Test
    void anythingElseIsADataError() {
        assertThatThrownBy(() -> StudentStatus.parse("REMOVED")).isInstanceOf(IllegalStateException.class);
    }
}
