package com.bladebook.api.client.security;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;

/**
 * The shared check every signed-in api-client route runs after the token's signature and expiry are
 * verified (ADR-MASTER section 15, ADR-023 d7 and d9):
 * <ul>
 *   <li>an ID token ({@code token_use = id}) issued to the <b>family</b> app client ({@code aud});</li>
 *   <li>the {@code Client} group in {@code cognito:groups};</li>
 *   <li>a login email;</li>
 *   <li>the password entered within the sign-in limit, measured from {@code auth_time}.</li>
 * </ul>
 * A coach's token is valid in the same pool, which is why the group and app client are checked here.
 */
public final class FamilyTokenRules {

    public enum Outcome { OK, FORBIDDEN, SIGN_IN_AGAIN }

    private final String familyAppClientId;
    private final Duration signInLimit;

    public FamilyTokenRules(String familyAppClientId, Duration signInLimit) {
        this.familyAppClientId = familyAppClientId;
        this.signInLimit = signInLimit;
    }

    public Outcome check(Map<String, Object> claims, Instant now) {
        if (!"id".equals(claims.get("token_use"))
                || !contains(claims.get("aud"), familyAppClientId)
                || !contains(claims.get("cognito:groups"), "Client")
                || !(claims.get("email") instanceof String)) {
            return Outcome.FORBIDDEN;
        }
        Instant authTime = instant(claims.get("auth_time"));
        if (authTime == null || authTime.plus(signInLimit).isBefore(now)) {
            return Outcome.SIGN_IN_AGAIN;
        }
        return Outcome.OK;
    }

    private static boolean contains(Object claim, String wanted) {
        if (claim instanceof Collection) {
            return ((Collection<?>) claim).contains(wanted);
        }
        return wanted.equals(claim);
    }

    private static Instant instant(Object claim) {
        if (claim instanceof Instant) {
            return (Instant) claim;
        }
        if (claim instanceof Number) {
            return Instant.ofEpochSecond(((Number) claim).longValue());
        }
        return null;
    }
}
