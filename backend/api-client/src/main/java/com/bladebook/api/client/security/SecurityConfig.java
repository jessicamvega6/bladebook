package com.bladebook.api.client.security;

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
 * Every api-client route needs a verified family token except {@code /api/client/health} and the coach-code
 * lookup before sign-up (ADR-023 d7, amended 2026-10-24), and, in the local profile only, the token stub.
 * Bearer tokens only: no cookies, no sessions, so no CSRF token.
 */
@Configuration
public class SecurityConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    FamilyTokenRules familyTokenRules(@Value("${bladebook.auth.client-app-client-id}") String familyAppClientId,
                                      @Value("${bladebook.auth.sign-in-minutes:60}") long signInMinutes) {
        return new FamilyTokenRules(familyAppClientId, Duration.ofMinutes(signInMinutes));
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, FamilyTokenRules rules, Clock clock)
            throws Exception {
        http.csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> {
                    a.requestMatchers(HttpMethod.GET, "/api/client/health").permitAll();
                    a.requestMatchers(HttpMethod.GET, "/api/client/coach-codes/*").permitAll();
                    a.anyRequest().authenticated();
                })
                .oauth2ResourceServer(o -> o.jwt(j -> { }))
                .addFilterAfter(new FamilyTokenFilter(rules, clock), BearerTokenAuthenticationFilter.class);
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
