package com.bladebook.core.data;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Who a family-path request acts for: the token's sub, never the request body (ADR-MASTER section 16). */
class ClientContextTest {

    @Test
    void thePartitionIsTheFamilys() {
        assertThat(new ClientContext("abc-123").partitionKey()).isEqualTo("CLIENT#abc-123");
    }

    @Test
    void anIdThatCouldEscapeItsPartitionIsRefused() {
        assertThatThrownBy(() -> new ClientContext("abc#STUDENT")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ClientContext(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ClientContext("")).isInstanceOf(IllegalArgumentException.class);
    }
}
