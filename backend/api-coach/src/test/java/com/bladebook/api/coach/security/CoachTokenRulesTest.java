package com.bladebook.api.coach.security;

import com.bladebook.api.coach.security.CoachTokenRules.Outcome;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** ADR-MASTER section 15: the one shared check on every signed-in api-coach route. */
class CoachTokenRulesTest {

    private static final Instant NOW = Instant.parse("2026-11-08T15:00:00Z");
    private final CoachTokenRules rules = new CoachTokenRules("coach-app", Duration.ofMinutes(60));

    private static Map<String, Object> coachToken() {
        Map<String, Object> c = new HashMap<>();
        c.put("sub", "8f1c");
        c.put("token_use", "id");
        c.put("aud", List.of("coach-app"));
        c.put("cognito:groups", List.of("Coach"));
        c.put("email", "dana@gmail.com");
        c.put("auth_time", NOW.minusSeconds(60));
        return c;
    }

    @Test
    void aCoachTokenFromTheCoachAppClientPasses() {
        assertThat(rules.check(coachToken(), NOW)).isEqualTo(Outcome.OK);
    }

    @Test
    void aTokenWithoutTheCoachGroupIsForbidden() {
        Map<String, Object> c = coachToken();
        c.put("cognito:groups", List.of("Client"));
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
        c.remove("cognito:groups");
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void aTokenFromTheFamilyAppClientIsForbiddenEvenWithTheCoachGroup() {
        Map<String, Object> c = coachToken();
        c.put("aud", List.of("family-app"));
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void anAccessTokenIsForbidden() {
        Map<String, Object> c = coachToken();
        c.put("token_use", "access");
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void aTokenWithNoEmailIsForbidden() {
        Map<String, Object> c = coachToken();
        c.remove("email");
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }

    @Test
    void sixtyMinutesAfterThePasswordIsStillFineButOneSecondMoreIsNot() {
        Map<String, Object> c = coachToken();
        c.put("auth_time", NOW.minus(Duration.ofMinutes(60)));
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.OK);
        c.put("auth_time", NOW.minus(Duration.ofMinutes(60)).minusSeconds(1));
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.SIGN_IN_AGAIN);
    }

    @Test
    void authTimeAsEpochSecondsIsRead() {
        Map<String, Object> c = coachToken();
        c.put("auth_time", NOW.minus(Duration.ofMinutes(90)).getEpochSecond());
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.SIGN_IN_AGAIN);
    }

    @Test
    void aTokenWithNoAuthTimeMustSignInAgain() {
        Map<String, Object> c = coachToken();
        c.remove("auth_time");
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.SIGN_IN_AGAIN);
    }

    @Test
    void theGroupAndClientChecksComeBeforeTheTimeCheck() {
        Map<String, Object> c = coachToken();
        c.put("cognito:groups", List.of("Client"));
        c.put("auth_time", NOW.minus(Duration.ofHours(3)));
        assertThat(rules.check(c, NOW)).isEqualTo(Outcome.FORBIDDEN);
    }
}
