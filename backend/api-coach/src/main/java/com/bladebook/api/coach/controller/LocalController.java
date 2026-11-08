package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.ProfileDtos.ProfileResponse;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.api.coach.security.LocalTokenStub;
import com.bladebook.core.domain.ProfileRules;
import com.bladebook.core.service.CoachProfileService;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * <b>Local profile only.</b> Two listed shortcuts:
 * <ul>
 *   <li>{@code POST /api/coach/local/token} stands in for Cognito's sign-up and sign-in;</li>
 *   <li>{@code POST /api/coach/local/business-email/confirm} stands in for clicking the
 *       business-email link, until batch 14 builds the email and its page.</li>
 * </ul>
 * Neither route exists outside the local profile.
 */
@RestController
@Profile("local")
@RequestMapping("/api/coach/local")
public class LocalController {

    public record TokenRequest(String loginEmail) {
    }

    private final LocalTokenStub stub;
    private final CoachProfileService profiles;

    public LocalController(LocalTokenStub stub, CoachProfileService profiles) {
        this.stub = stub;
        this.profiles = profiles;
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
}
