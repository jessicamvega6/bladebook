package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.ProfileDtos.DetailsRequest;
import com.bladebook.api.coach.dto.ProfileDtos.PaymentsRequest;
import com.bladebook.api.coach.dto.ProfileDtos.ProfileResponse;
import com.bladebook.api.coach.dto.ProfileDtos.SignupRequest;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.core.service.CoachProfileService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sign-up's business-details step and the coach's own profile. Who the coach is always comes from
 * the token; no request body names a coach.
 */
@RestController
@RequestMapping("/api/coach")
public class ProfileController {

    private final CoachProfileService profiles;

    public ProfileController(CoachProfileService profiles) {
        this.profiles = profiles;
    }

    /** 404 {@code NO_PROFILE} until sign-up step 3 is done; the website then shows that step. */
    @GetMapping("/profile")
    public ProfileResponse profile(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.of(profiles.profile(CurrentCoach.of(jwt)));
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ProfileResponse signup(@AuthenticationPrincipal Jwt jwt, @RequestBody SignupRequest body) {
        return ProfileResponse.of(profiles.completeSignup(CurrentCoach.of(jwt), CurrentCoach.loginEmail(jwt),
                body.toDetails()));
    }

    @PutMapping("/profile/details")
    public ProfileResponse details(@AuthenticationPrincipal Jwt jwt, @RequestBody DetailsRequest body) {
        return ProfileResponse.of(profiles.updateDetails(CurrentCoach.of(jwt), body.toDetails()));
    }

    @PutMapping("/profile/payments")
    public ProfileResponse payments(@AuthenticationPrincipal Jwt jwt, @RequestBody PaymentsRequest body) {
        return ProfileResponse.of(profiles.updatePayments(CurrentCoach.of(jwt), body.toPayments()));
    }

    @PostMapping("/profile/code/rotate")
    public ProfileResponse rotate(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.of(profiles.rotateCode(CurrentCoach.of(jwt)));
    }

    /** "Use my login email instead" while a different business email waits for its link. */
    @PostMapping("/profile/business-email/use-login")
    public ProfileResponse useLoginEmail(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.of(profiles.useLoginEmail(CurrentCoach.of(jwt)));
    }
}
