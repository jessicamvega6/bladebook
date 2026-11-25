package com.bladebook.api.coach.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

import java.time.Clock;
import java.time.Duration;

/**
 * Every api-coach route needs a verified coach token except {@code /api/coach/health}, and, in the
 * local profile only, the token stub. Bearer tokens only: no cookies, no sessions, so no CSRF token.
 */
@Configuration
public class SecurityConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    CoachTokenRules coachTokenRules(@Value("${bladebook.auth.coach-app-client-id}") String coachAppClientId,
                                    @Value("${bladebook.auth.sign-in-minutes:60}") long signInMinutes) {
        return new CoachTokenRules(coachAppClientId, Duration.ofMinutes(signInMinutes));
    }

    /** The rinkside page's routes: 4 hours from sign-in (ADR-023 d6; ADR-MASTER section 15). */
    static final String RINKSIDE = "/api/coach/rinkside/";

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, CoachTokenRules rules, Clock clock,
                                            @Value("${bladebook.auth.coach-app-client-id}") String coachAppClientId,
                                            @Value("${bladebook.auth.rinkside-sign-in-minutes:240}") long rinksideMinutes)
            throws Exception {
        CoachTokenRules rinkside = new CoachTokenRules(coachAppClientId, Duration.ofMinutes(rinksideMinutes));
        // CSRF protection is off on purpose (CodeQL java/spring-disabled-csrf-protection, dismissed in Batch 30b): the API is
        // stateless and authenticates only with a bearer token the website's JavaScript puts in the Authorization header
        // (ADR-023). No cookie or session authenticates a request, so a cross-site request carries no credentials. Revisit
        // if sign-in ever moves to a cookie. See docs/runbooks/security-scanning.md.
        http.csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> {
                    a.requestMatchers(HttpMethod.GET, "/api/coach/health").permitAll();
                    a.anyRequest().authenticated();
                })
                .oauth2ResourceServer(o -> o.jwt(j -> { }))
                .addFilterAfter(new CoachTokenFilter(rules, rinkside, RINKSIDE, clock), BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    /**
     * Cognito's signing keys and issuer: on AWS the environment's user pool; locally, dev's (ruling I31), whose settings
     * {@code npm --prefix infra run dev-pool} writes to {@code ~/.bladebook/dev-pool.properties}. Only the tests and the
     * seed generator use test-made tokens instead ({@code stub-tokens}, test code).
     */
    @Bean
    @Profile("!stub-tokens")
    JwtDecoder cognitoJwtDecoder(@Value("${bladebook.auth.issuer:}") String issuer) {
        if (issuer.isBlank()) {
            throw new IllegalStateException("bladebook.auth.issuer isn't set. Locally, run `npm --prefix infra run dev-pool` "
                    + "(signed in to dev's AWS account) so this API accepts dev's user pool's tokens.");
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json").build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }
}
