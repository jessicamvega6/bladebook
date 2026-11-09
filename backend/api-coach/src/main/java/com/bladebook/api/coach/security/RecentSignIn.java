package com.bladebook.api.coach.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * The tighter limit for saving a schedule change: the password entered within the last 15 minutes,
 * measured from {@code auth_time} (ADR-MASTER section 15). The window is configuration.
 */
@Component
public class RecentSignIn {

    private final Duration window;
    private final Clock clock;

    public RecentSignIn(@Value("${bladebook.auth.schedule-save-minutes:15}") long minutes, Clock clock) {
        this.window = Duration.ofMinutes(minutes);
        this.clock = clock;
    }

    /** @throws RecentSignInRequired if the password was entered longer ago than the window */
    public void require(Jwt jwt) {
        Object claim = jwt.getClaims().get("auth_time");
        Instant authTime = claim instanceof Instant ? (Instant) claim
                : claim instanceof Number ? Instant.ofEpochSecond(((Number) claim).longValue()) : null;
        if (authTime == null || authTime.plus(window).isBefore(clock.instant())) {
            throw new RecentSignInRequired();
        }
    }
}
