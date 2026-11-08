package com.bladebook.api.coach.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;

/**
 * Runs {@link CoachTokenRules} on every request that carries a verified token. A wrong group or app
 * client is 403; a sign-in that's too old is 401 with {@code SIGN_IN_AGAIN}, which the website
 * handles by asking the coach to sign in again.
 */
public final class CoachTokenFilter extends OncePerRequestFilter {

    private final CoachTokenRules rules;
    private final Clock clock;

    public CoachTokenFilter(CoachTokenRules rules, Clock clock) {
        this.rules = rules;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken) {
            CoachTokenRules.Outcome outcome =
                    rules.check(((JwtAuthenticationToken) auth).getToken().getClaims(), clock.instant());
            if (outcome == CoachTokenRules.Outcome.FORBIDDEN) {
                write(response, 403, "FORBIDDEN", "This sign-in can't use the coach website.");
                return;
            }
            if (outcome == CoachTokenRules.Outcome.SIGN_IN_AGAIN) {
                write(response, 401, "SIGN_IN_AGAIN", "Please sign in again.");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    static void write(HttpServletResponse response, int status, String error, String message) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + error + "\",\"message\":\"" + message + "\"}");
    }
}
