package com.bladebook.api.client.controller;

import com.bladebook.api.client.config.LocalEventDispatcher;
import com.bladebook.api.client.security.LocalTokenStub;
import com.bladebook.core.domain.ProfileRules;
import com.bladebook.core.service.DeadlineSweepService;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * <b>Local profile only; a listed shortcut.</b> {@code POST /api/client/local/token} stands in for Cognito's
 * family sign-up, email verification and log-in: it hands back a family ID token for any email, with no
 * password. The route doesn't exist outside the local profile.
 */
@RestController
@Profile("local")
public class LocalController {

    public record TokenRequest(String loginEmail) {
    }

    private final LocalTokenStub stub;
    private final LocalEventDispatcher events;

    public LocalController(LocalTokenStub stub, LocalEventDispatcher events) {
        this.stub = stub;
        this.events = events;
    }

    @PostMapping("/api/client/local/token")
    public Map<String, String> token(@RequestBody TokenRequest body) {
        return Map.of("idToken", stub.familyToken(ProfileRules.email("loginEmail", body.loginEmail())));
    }

    /**
     * <b>A listed shortcut.</b> Runs {@code sched-deadline-sweep} now, as the Scheduler would on the hour: invitations whose
     * lesson started expire, and dates nobody answered are cancelled with no answer. Signed in, but any family may run it.
     */
    @PostMapping("/api/client/local/sweep")
    public DeadlineSweepService.Swept sweep() {
        return events.sweepNow();
    }
}
