package com.bladebook.api.client.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.function.Supplier;

/**
 * <b>On AWS only.</b> The API accepts only requests that came through CloudFront (ADR-019, amended 2026-11-17, I1):
 * CloudFront adds {@value #HEADER} with a secret from Secrets Manager, and a request without the right value is refused
 * before anything else runs, so API Gateway's own address can't be used to skip the firewall. The firewall checks the
 * same header. The secret is read once and read again, at most once a minute, when a request doesn't match it, so a
 * rotated secret is picked up without a restart.
 */
@Configuration
@Profile("!local")
public class OriginCheck {

    public static final String HEADER = "x-bladebook-origin";
    static final Duration REREAD_AFTER = Duration.ofMinutes(1);

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> originCheckFilter(@Value("${bladebook.origin-secret-arn}") String secretArn,
                                                                   Clock clock) {
        SecretsManagerClient sm = SecretsManagerClient.builder().httpClient(UrlConnectionHttpClient.create()).build();
        Secret secret = new Secret(() -> sm.getSecretValue(r -> r.secretId(secretArn)).secretString(), clock);
        FilterRegistrationBean<OncePerRequestFilter> reg = new FilterRegistrationBean<>(filter(secret));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE); // before Spring Security and everything else
        return reg;
    }

    static OncePerRequestFilter filter(Secret secret) {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                if (secret.matches(request.getHeader(HEADER))) {
                    chain.doFilter(request, response);
                    return;
                }
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"message\":\"Forbidden\"}");
            }
        };
    }

    /** The secret's current value, compared in constant time. */
    static final class Secret {
        private final Supplier<String> read;
        private final Clock clock;
        private byte[] value;
        private Instant readAt = Instant.MIN;

        Secret(Supplier<String> read, Clock clock) {
            this.read = read;
            this.clock = clock;
        }

        synchronized boolean matches(String sent) {
            if (sent == null || sent.isEmpty()) {
                return false;
            }
            byte[] given = sent.getBytes(StandardCharsets.UTF_8);
            if (value != null && MessageDigest.isEqual(value, given)) {
                return true;
            }
            Instant now = clock.instant();
            if (value == null || !now.isBefore(readAt.plus(REREAD_AFTER))) {
                value = read.get().getBytes(StandardCharsets.UTF_8);
                readAt = now;
                return MessageDigest.isEqual(value, given);
            }
            return false;
        }
    }
}
