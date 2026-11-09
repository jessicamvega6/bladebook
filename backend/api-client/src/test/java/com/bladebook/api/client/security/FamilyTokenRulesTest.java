package com.bladebook.api.client.security;

import com.bladebook.api.client.security.FamilyTokenRules.Outcome;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** ADR-MASTER section 15: the one shared check on every signed-in api-client route. */
class FamilyTokenRulesTest {

    private static final Instant NOW = Instant.parse("2026-11-09T15:00:00Z");
    private final FamilyTokenRules rules = new FamilyTokenRules("family-app", Duration.ofMinutes(60));

    private static Map<String, Object> familyToken() {
        Map<String, Object> c = new HashMap<>();
        c.put("sub", "5a2e");
        c.put("token_use", "id");
        c.put("aud", List.of("family-app"));
        c.put("cognito:groups", List.of("Client"));
        c.put("email", "sarah@example.com");
        c.put("auth_time", NOW.minusSeconds(60));
        return c;
    }

    @Test
    void aFamilyTokenFromTheFamilyAppClientPasses() {
        assertThat(rules.check(familyToken(), NOW)).isEqualTo(Outcome.OK);
    }

    @Test
    void aCoachsTokenIsForbidden() {
        Map<String, Object> c = familyToken();
        c.put("cognito:groups", List.of("Coach"));
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void aTokenFromTheCoachAppClientIsForbidden() {
        Map<String, Object> c = familyToken();
        c.put("aud", "coach-app");
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void anAccessTokenOrNoEmailIsForbidden() {
        Map<String, Object> access = familyToken();
        access.put("token_use", "access");
        assertThat(rules.check(access, NOW)).isEqualTo(Outcome.FORBIDDEN);
        Map<String, Object> noEmail = familyToken();
        noEmail.remove("email");
        assertThat(rules.check(noEmail, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void sixtyMinutesAfterThePasswordTheFamilySignsInAgain() {
        Map<String, Object> c = familyToken();
        c.put("auth_time", NOW.minus(Duration.ofMinutes(61)).getEpochSecond());
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.SIGN_IN_AGAIN);
        c.put("auth_time", NOW.minus(Duration.ofMinutes(59)).getEpochSecond());
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.OK);
        c.remove("auth_time");
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.SIGN_IN_AGAIN);
    }
}
