package com.bladebook.core.data;

import java.util.regex.Pattern;

/**
 * Who a coach-path request acts for. {@code coachId} is the Cognito {@code sub} from the verified
 * token, never from the request body (ADR-MASTER section 16).
 */
public final class AccessContext {

    // Cognito subs are UUIDs; also refuse '#', which would let a key escape its partition.
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9-]{1,128}$");

    private final String coachId;

    public AccessContext(String coachId) {
        if (coachId == null || !SAFE_ID.matcher(coachId).matches()) {
            throw new IllegalArgumentException("coachId must be a token sub");
        }
        this.coachId = coachId;
    }

    public String coachId() {
        return coachId;
    }

    /** {@code COACH#<coachId>}. */
    public String partitionKey() {
        return "COACH#" + coachId;
    }

    @Override
    public String toString() {
        return "AccessContext[" + coachId + "]";
    }
}
