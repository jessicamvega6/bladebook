package com.bladebook.core.data;

import java.util.regex.Pattern;

/**
 * Who a family-path request acts for. {@code clientId} is the Cognito {@code sub} from the verified
 * family token, never from the request body (ADR-MASTER section 16). On AWS this is the first
 * {@code client-tenant} session, tagged only {@code clientId}.
 */
public final class ClientContext {

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9-]{1,128}$");

    private final String clientId;

    public ClientContext(String clientId) {
        if (clientId == null || !SAFE_ID.matcher(clientId).matches()) {
            throw new IllegalArgumentException("clientId must be a token sub");
        }
        this.clientId = clientId;
    }

    public String clientId() {
        return clientId;
    }

    /** {@code CLIENT#<clientId>}. */
    public String partitionKey() {
        return "CLIENT#" + clientId;
    }

    @Override
    public String toString() {
        return "ClientContext[" + clientId + "]";
    }
}
