package com.bladebook.consumers.handler;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@code auth-post-confirmation} (ADR-023 d10): the group comes only from the app client in Cognito's event. */
class PostConfirmationTest {

    private final List<String> added = new ArrayList<>();
    private final PostConfirmation handler = new PostConfirmation(
            Map.of("BLADEBOOK_COACHCLIENTID", "coach-client", "BLADEBOOK_FAMILYCLIENTID", "family-client")::get,
            (pool, user, group) -> added.add(pool + "/" + user + "/" + group));

    private static tools.jackson.databind.JsonNode event(String trigger, String clientId) {
        return JsonMapper.builder().build().readTree( "{\"triggerSource\":\"" + trigger + "\",\"userPoolId\":\"us-east-1_P\",\"userName\":\"u1\","
                + "\"callerContext\":{\"clientId\":\"" + clientId + "\"},"
                + "\"request\":{\"userAttributes\":{\"custom:role\":\"Coach\",\"email\":\"a@example.com\"}}}");
    }

    @Test
    void theCoachClientMakesACoachAndTheFamilyClientAFamily() {
        assertThat(handler.handle(event("PostConfirmation_ConfirmSignUp", "coach-client"))).isEqualTo("Coach");
        assertThat(handler.handle(event("PostConfirmation_ConfirmSignUp", "family-client"))).isEqualTo("Client");
        assertThat(added).containsExactly("us-east-1_P/u1/Coach", "us-east-1_P/u1/Client");
    }

    @Test
    void whatThePersonTypedNeverChoosesTheGroup() {
        // The event carries an attribute claiming Coach; through the family client it's still Client.
        assertThat(handler.handle(event("PostConfirmation_ConfirmSignUp", "family-client"))).isEqualTo("Client");
    }

    @Test
    void anUnknownClientFailsTheConfirmationAndAPasswordResetDoesNothing() {
        assertThatThrownBy(() -> handler.handle(event("PostConfirmation_ConfirmSignUp", "someone-else")))
                .hasMessageContaining("unknown app client");
        assertThat(handler.handle(event("PostConfirmation_ConfirmForgotPassword", "coach-client"))).isNull();
        assertThat(added).isEmpty();
    }
}
