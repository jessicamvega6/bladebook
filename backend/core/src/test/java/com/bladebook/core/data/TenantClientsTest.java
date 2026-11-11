package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** ADR-MASTER section 16: local mode refuses to start unless the endpoint is localhost. */
class TenantClientsTest {

    @ParameterizedTest
    @ValueSource(strings = {"http://localhost:8000", "http://127.0.0.1:8000", "http://[::1]:8000"})
    void localModeStartsAgainstLocalhost(String endpoint) {
        assertThat(TenantClients.local(URI.create(endpoint))).isNotNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://dynamodb.us-east-1.amazonaws.com", "http://10.0.0.5:8000",
            "http://localhost.evil.com:8000", "http://dynamodb-local:8000"})
    void localModeRefusesAnyOtherEndpoint(String endpoint) {
        assertThatThrownBy(() -> TenantClients.local(URI.create(endpoint)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("localhost");
    }

    @Test
    void localModeRefusesNoEndpoint() {
        assertThatThrownBy(() -> TenantClients.local(null)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void clientForNeedsAnAccessContext() {
        TenantClients clients = TenantClients.local(URI.create("http://localhost:8000"));
        assertThatThrownBy(() -> clients.clientFor((AccessContext) null)).isInstanceOf(NullPointerException.class);
        assertThat(clients.clientFor(new AccessContext("sub-1"))).isNotNull();
    }

    @Test
    void aFamilysClientNeedsAClientContextAndACoachsNeedsALinkedCoach() {
        TenantClients clients = TenantClients.local(URI.create("http://localhost:8000"));
        ClientContext family = new ClientContext("sub-2");
        assertThatThrownBy(() -> clients.clientFor((ClientContext) null)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> clients.clientFor(family, null)).isInstanceOf(NullPointerException.class);
        assertThat(clients.clientFor(family)).isNotNull();
        assertThat(clients.clientFor(family, new LinkedCoach("dana", com.bladebook.core.domain.StudentStatus.ACTIVE))).isNotNull();
        assertThat(clients.forCodeLookup()).isNotNull();
        assertThat(clients.forConsumer()).isNotNull();
    }
}
