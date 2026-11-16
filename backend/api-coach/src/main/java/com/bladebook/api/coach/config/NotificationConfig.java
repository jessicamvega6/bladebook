package com.bladebook.api.coach.config;

import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.LocalOutbox;
import com.bladebook.core.service.LocalStreamRouter;
import com.bladebook.core.service.Mailer;
import com.bladebook.core.service.NotificationService;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.ScheduledJobs;
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
 * The emails and the jobs that send them (Batch 13). On AWS each consumer and job is its own function, triggered by the
 * table's stream or the Scheduler, and the mailer is SES (Batch 17). Locally three listed shortcuts stand in: the stream
 * ({@link LocalStreamRouter} after each request, SC-20), the outbox ({@link LocalOutbox}, SC-21) and the Scheduler
 * ({@link LocalJobs}, SC-22).
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

    /** SES isn't set up until the infrastructure batch (Batch 17); outside the local profile nothing is deployed yet. */
    @Bean
    @Profile("!local")
    Mailer sesNotSetUp() {
        return e -> {
            throw new IllegalStateException("Email isn't set up yet: SES comes with the infrastructure (Batch 17).");
        };
    }

    @Bean
    NotificationService notificationService(NotifyRepository repo, Mailer mailer, Clock clock,
                                            @Value("${bladebook.site-url:http://localhost:5173}") String site) {
        return new NotificationService(repo, mailer, new NotificationService.Links(site), clock);
    }

    /** The unpaid threshold is a setting (ADR-MASTER section 12: Parameter Store on AWS). Blank: the Monday email sends nothing. */
    @Bean
    ScheduledJobs scheduledJobs(NotifyRepository repo, NotificationService notifications, ScheduleChangeService schedules, Mailer mailer,
                                @Value("${bladebook.unpaid-reminder.threshold-days:}") String threshold) {
        return new ScheduledJobs(repo, notifications, schedules, mailer, threshold.isBlank() ? null : Integer.valueOf(threshold.trim()));
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
