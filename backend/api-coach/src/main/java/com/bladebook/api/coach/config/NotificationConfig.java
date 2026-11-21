package com.bladebook.api.coach.config;

import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.LocalOutbox;
import com.bladebook.core.service.LocalStreamRouter;
import com.bladebook.core.service.Mailer;
import com.bladebook.core.service.NotificationService;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.ScheduledJobs;
import com.bladebook.core.service.SesMailer;
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
 * table's stream or the Scheduler, and the mailer is SES. Locally three listed shortcuts stand in: the stream
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

    /**
     * On AWS: SES. {@code api-coach}'s role may send only the business-email confirmation (ADR-MASTER section 2, I9); every
     * other email comes from a consumer or a scheduled job, each its own function.
     */
    @Bean
    @Profile("!local")
    Mailer sesMailer(@Value("${bladebook.mail.from}") String from, @Value("${bladebook.mail.no-reply}") String noReply) {
        return SesMailer.aws(new SesMailer.Senders(from, noReply));
    }

    @Bean
    NotificationService notificationService(NotifyRepository repo, Mailer mailer, Clock clock,
                                            @Value("${bladebook.coach-site-url:http://localhost:5173/coach}") String coachSite,
                                            @Value("${bladebook.family-site-url:http://localhost:5173/family}") String familySite) {
        return new NotificationService(repo, mailer, new NotificationService.Links(coachSite, familySite), clock);
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
