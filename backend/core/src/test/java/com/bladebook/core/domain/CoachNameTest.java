package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CoachNameTest {

    @Test
    void initialsComeFromBothNames() {
        assertThat(new CoachName("Dana", "Whitfield").initials()).isEqualTo("DW");
    }
}
