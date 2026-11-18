package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

/**
 * {@code auth-post-confirmation} (ADR-023 d10): once a new account's email is verified, adds {@code Coach} to an account
 * confirmed through the coach app client and {@code Client} to one confirmed through the family app client. The group
 * comes only from the app client ID in Cognito's event, never from anything the person typed. Cognito calls it
 * synchronously: if it fails, confirmation fails and the person tries again, so it has no dead-letter queue.
 */
public final class PostConfirmation implements RequestStreamHandler {

    /** Adds the user to the group; throws if it didn't. */
    @FunctionalInterface
    interface Groups {
        void add(String userPoolId, String userName, String group);
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static volatile Groups cognito;

    private final Function<String, String> env;
    private final Groups groups;

    public PostConfirmation() {
        this(System::getenv, null);
    }

    PostConfirmation(Function<String, String> env, Groups groups) {
        this.env = env;
        this.groups = groups;
    }

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        byte[] event = in.readAllBytes();
        String group = handle(JSON.readTree(event));
        context.getLogger().log(group == null ? "not a sign-up confirmation: nothing to do" : "added to " + group);
        out.write(event); // Cognito wants its event back
    }

    /** The group added, or null if this wasn't a sign-up confirmation. */
    String handle(JsonNode event) {
        if (!"PostConfirmation_ConfirmSignUp".equals(event.path("triggerSource").asString())) {
            return null; // e.g. a confirmed password reset: the account already has its group
        }
        String clientId = event.path("callerContext").path("clientId").asString();
        String group = groupFor(clientId, required("BLADEBOOK_COACHCLIENTID"), required("BLADEBOOK_FAMILYCLIENTID"));
        groups().add(event.path("userPoolId").asString(), event.path("userName").asString(), group);
        return group;
    }

    /** {@code Coach} or {@code Client} by the app client; any other client is refused, so confirmation fails. */
    static String groupFor(String clientId, String coachClient, String familyClient) {
        Map<String, String> byClient = Map.of(coachClient, "Coach", familyClient, "Client");
        String group = byClient.get(Objects.requireNonNullElse(clientId, ""));
        if (group == null) {
            throw new IllegalStateException("a sign-up through an unknown app client");
        }
        return group;
    }

    private String required(String name) {
        String v = env.apply(name);
        if (v == null || v.isBlank()) {
            throw new IllegalStateException(name + " is not set");
        }
        return v;
    }

    private Groups groups() {
        if (groups != null) {
            return groups;
        }
        Groups g = cognito;
        if (g == null) {
            synchronized (PostConfirmation.class) {
                if (cognito == null) {
                    CognitoIdentityProviderClient c = CognitoIdentityProviderClient.builder()
                            .httpClient(UrlConnectionHttpClient.create()).region(new DefaultAwsRegionProviderChain().getRegion()).build();
                    cognito = (pool, user, name) -> c.adminAddUserToGroup(r -> r.userPoolId(pool).username(user).groupName(name));
                }
                g = cognito;
            }
        }
        return g;
    }
}
