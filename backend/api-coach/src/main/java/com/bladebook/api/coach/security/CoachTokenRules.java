package com.bladebook.api.coach.security;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;

/**
 * The shared check every signed-in api-coach route runs after the token's signature and expiry are
 * verified (ADR-MASTER section 15, ADR-023 d7 and d9):
 * <ul>
 *   <li>an ID token ({@code token_use = id}) issued to the <b>coach</b> app client ({@code aud});</li>
 *   <li>the {@code Coach} group in {@code cognito:groups};</li>
 *   <li>a login email;</li>
 *   <li>the password entered within the sign-in limit, measured from {@code auth_time}.</li>
 * </ul>
 * A family's token is valid in the same pool, which is why the group and app client are checked here.
 */
public final class CoachTokenRules {

    public enum Outcome { OK, FORBIDDEN, SIGN_IN_AGAIN }

    private final String coachAppClientId;
    private final Duration signInLimit;

    public CoachTokenRules(String coachAppClientId, Duration signInLimit) {
        this.coachAppClientId = coachAppClientId;
        this.signInLimit = signInLimit;
    }

    public Outcome check(Map<String, Object> claims, Instant now) {
        if (!"id".equals(claims.get("token_use"))
                || !contains(claims.get("aud"), coachAppClientId)
                || !contains(claims.get("cognito:groups"), "Coach")
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
