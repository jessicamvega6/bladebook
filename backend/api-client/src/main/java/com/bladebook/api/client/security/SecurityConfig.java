package com.bladebook.api.client.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
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
    SecurityFilterChain securityFilterChain(HttpSecurity http, FamilyTokenRules rules, Clock clock, Environment env)
            throws Exception {
        boolean local = env.acceptsProfiles(Profiles.of("local"));
        http.csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> {
                    a.requestMatchers(HttpMethod.GET, "/api/client/health").permitAll();
                    a.requestMatchers(HttpMethod.GET, "/api/client/coach-codes/*").permitAll();
                    if (local) {
                        a.requestMatchers(HttpMethod.POST, "/api/client/local/token").permitAll();
                    }
                    a.anyRequest().authenticated();
                })
                .oauth2ResourceServer(o -> o.jwt(j -> { }))
                .addFilterAfter(new FamilyTokenFilter(rules, clock), BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    /** On AWS: Cognito's signing keys and issuer. Not exercised yet; nothing is deployed. */
    @Bean
    @Profile("!local")
    JwtDecoder cognitoJwtDecoder(@Value("${bladebook.auth.issuer}") String issuer) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json").build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }
}
