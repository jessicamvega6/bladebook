package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AccessContextTest {

    @Test
    void holdsTheCoachIdAndItsPartitionKey() {
        AccessContext ctx = new AccessContext("8f1c-sub");
        assertThat(ctx.coachId()).isEqualTo("8f1c-sub");
        assertThat(ctx.partitionKey()).isEqualTo("COACH#8f1c-sub");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  ", "a#b", "a b"})
    void refusesAnIdThatCouldEscapeItsPartition(String id) {
        assertThatThrownBy(() -> new AccessContext(id)).isInstanceOf(IllegalArgumentException.class);
    }
}
