package com.bladebook.api.client.controller;

import com.bladebook.api.client.security.LocalTokenStub;
import com.bladebook.core.domain.ProfileRules;
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

    public LocalController(LocalTokenStub stub) {
        this.stub = stub;
    }

    @PostMapping("/api/client/local/token")
    public Map<String, String> token(@RequestBody TokenRequest body) {
        return Map.of("idToken", stub.familyToken(ProfileRules.email("loginEmail", body.loginEmail())));
    }
}
