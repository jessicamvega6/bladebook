package com.bladebook.api.client.config;

import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.LocalOutbox;
import com.bladebook.core.service.LocalStreamRouter;
import com.bladebook.core.service.Mailer;
import com.bladebook.core.service.NotificationService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;

/**
 * The emails the families' own writes cause (Batch 13): booking confirmations, a late cancel to the coach, every shared
 * lesson email, and the sweep's "no answer". On AWS each consumer is its own function on the table's stream and the mailer
 * is SES (Batch 17). Locally the stream is {@link LocalStreamRouter} after each request (SC-20) and the mailer
 * {@link LocalOutbox} (SC-21).
 */
@Configuration
public class NotificationConfig {

    @Bean
    NotifyRepository notifyRepository(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new NotifyRepository(clients, table);
    }

    /** <b>Local profile: a listed shortcut (SC-21).</b> Emails are kept in memory, never sent. */
    @Bean
    @Profile("local")
    LocalOutbox localOutbox(Clock clock) {
        return new LocalOutbox(clock);
    }

    /**
     * On AWS {@code api-client} sends no email: its role has no SES permission (ADR-MASTER section 2). The emails its writes
     * cause are sent by the consumers on the table's stream. Locally the same services send them in-process (SC-20).
     */
    @Bean
    @Profile("!local")
    Mailer noEmailFromApiClient() {
        return e -> {
            throw new IllegalStateException("api-client sends no email on AWS; the consumers send " + e.template() + ".");
        };
    }

    @Bean
    NotificationService notificationService(NotifyRepository repo, Mailer mailer, Clock clock,
                                            @Value("${bladebook.coach-site-url:http://localhost:5173/coach}") String coachSite,
                                            @Value("${bladebook.family-site-url:http://localhost:5173/family}") String familySite) {
        return new NotificationService(repo, mailer, new NotificationService.Links(coachSite, familySite), clock);
    }

    @Bean
    @Profile("local")
    LocalStreamRouter localStreamRouter(NotificationService notifications) {
        return new LocalStreamRouter(notifications);
    }

    /**
     * <b>Local profile: a listed shortcut (SC-20).</b> After each request, every item it wrote goes to the consumers, as the
     * table's stream would carry it on AWS. A consumer's failure is logged, never the request's.
     */
    @Bean
    @Profile("local")
    OncePerRequestFilter localStreamFilter(TenantClients clients, LocalStreamRouter router) {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                try {
                    chain.doFilter(request, response);
                } finally {
                    router.drain(clients.localStream());
                }
            }
        };
    }
}
