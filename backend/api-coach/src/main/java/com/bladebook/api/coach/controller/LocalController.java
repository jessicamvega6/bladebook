package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.config.LocalJobs;
import com.bladebook.api.coach.dto.ProfileDtos.ProfileResponse;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.api.coach.security.LocalTokenStub;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.ProfileRules;
import com.bladebook.core.service.CoachProfileService;
import com.bladebook.core.service.LocalOutbox;
import com.bladebook.core.service.ScheduledJobs;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * <b>Local profile only.</b> Listed shortcuts:
 * <ul>
 *   <li>{@code POST /api/coach/local/token} stands in for Cognito's sign-up and sign-in;</li>
 *   <li>{@code POST /api/coach/local/business-email/confirm} stands in for clicking the
 *       business-email link, until batch 14 builds the email and its page;</li>
 *   <li>{@code POST /api/coach/local/jobs/{day-reminder,unpaid-reminder,lesson-roller}?date=} runs a scheduled job for a
 *       date, as the Scheduler would (SC-22);</li>
 *   <li>{@code GET /api/coach/local/outbox} lists the emails this API would have sent (SC-21).</li>
 * </ul>
 * None of these routes exist outside the local profile. The job and outbox routes are a developer's tools: any signed-in
 * coach may run them, and the outbox shows every coach's emails.
 */
@RestController
@Profile("local")
@RequestMapping("/api/coach/local")
public class LocalController {

    public record TokenRequest(String loginEmail) {
    }

    private final LocalTokenStub stub;
    private final CoachProfileService profiles;
    private final LocalJobs jobs;
    private final LocalOutbox outbox;

    public LocalController(LocalTokenStub stub, CoachProfileService profiles, LocalJobs jobs, LocalOutbox outbox) {
        this.stub = stub;
        this.profiles = profiles;
        this.jobs = jobs;
        this.outbox = outbox;
    }

    @PostMapping("/token")
    public Map<String, String> token(@RequestBody TokenRequest body) {
        String email = ProfileRules.email("loginEmail", body.loginEmail());
        return Map.of("idToken", stub.coachToken(email));
    }

    @PostMapping("/business-email/confirm")
    public ProfileResponse markConfirmed(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.of(profiles.confirmPendingBusinessEmail(CurrentCoach.of(jwt)));
    }

    @PostMapping("/jobs/day-reminder")
    public ScheduledJobs.DayOf dayReminder(@RequestParam(required = false) String date) {
        return jobs.dayOf(date(date));
    }

    @PostMapping("/jobs/unpaid-reminder")
    public ScheduledJobs.Unpaid unpaidReminder(@RequestParam(required = false) String date) {
        return jobs.unpaid(date(date));
    }

    @PostMapping("/jobs/lesson-roller")
    public ScheduledJobs.Rolled lessonRoller(@RequestParam(required = false) String date) {
        return jobs.roll(date(date));
    }

    @GetMapping("/outbox")
    public List<LocalOutbox.Sent> outbox() {
        return outbox.list();
    }

    /** The date the job is for; today in the launch time zone when none is given. */
    private LocalDate date(String date) {
        if (date == null || date.isBlank()) {
            return jobs.today();
        }
        try {
            return LocalDate.parse(date.trim());
        } catch (DateTimeParseException e) {
            throw DomainException.invalid("date", "Give the date as YYYY-MM-DD.");
        }
    }
}
