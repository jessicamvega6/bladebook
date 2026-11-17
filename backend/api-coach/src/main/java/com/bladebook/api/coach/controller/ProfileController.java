package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.ProfileDtos.AddressRequest;
import com.bladebook.api.coach.dto.ProfileDtos.DetailsRequest;
import com.bladebook.api.coach.dto.ProfileDtos.LinkResponse;
import com.bladebook.api.coach.dto.ProfileDtos.PaymentsRequest;
import com.bladebook.api.coach.dto.ProfileDtos.ProfileResponse;
import com.bladebook.api.coach.dto.ProfileDtos.SignupRequest;
import com.bladebook.api.coach.dto.ProfileDtos.TokenRequest;
import com.bladebook.api.coach.dto.ProfileDtos.VisibilityRequest;
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

    /** What approved families see: the phone and the business email, each switched on or off. */
    @PutMapping("/profile/visibility")
    public ProfileResponse visibility(@AuthenticationPrincipal Jwt jwt, @RequestBody VisibilityRequest body) {
        return ProfileResponse.of(profiles.updateVisibility(CurrentCoach.of(jwt), body.showPhone(), body.showEmail()));
    }

    @PostMapping("/profile/code/rotate")
    public ProfileResponse rotate(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.of(profiles.rotateCode(CurrentCoach.of(jwt)));
    }

    // ---- Profile → Business email and the confirmation link (ADR-016, amended 2026-11-12) ----

    /** "Use a new address" (or, with {@code replaces}, sign-up step 4's "Change address"): saves it and emails its link. */
    @PostMapping("/profile/business-email")
    public ProfileResponse addBusinessEmail(@AuthenticationPrincipal Jwt jwt, @RequestBody AddressRequest body) {
        return ProfileResponse.of(profiles.addBusinessEmail(CurrentCoach.of(jwt), body.address(), body.replaces()));
    }

    /** Profile → Business email's Save: a confirmed address, or the login email, becomes the business email. */
    @PutMapping("/profile/business-email")
    public ProfileResponse chooseBusinessEmail(@AuthenticationPrincipal Jwt jwt, @RequestBody AddressRequest body) {
        return ProfileResponse.of(profiles.chooseBusinessEmail(CurrentCoach.of(jwt), body.address()));
    }

    /** "Resend link": a new link; the earlier one stops working. */
    @PostMapping("/profile/business-email/resend")
    public ProfileResponse resendLink(@AuthenticationPrincipal Jwt jwt, @RequestBody AddressRequest body) {
        return ProfileResponse.of(profiles.resendBusinessEmailLink(CurrentCoach.of(jwt), body.address()));
    }

    @PostMapping("/profile/business-email/remove")
    public ProfileResponse removeBusinessEmail(@AuthenticationPrincipal Jwt jwt, @RequestBody AddressRequest body) {
        return ProfileResponse.of(profiles.removeBusinessEmail(CurrentCoach.of(jwt), body.address()));
    }

    /**
     * The confirm page, before Confirm: which address the link is for. Changes nothing. The token travels in the body,
     * never the address, so it isn't written to access logs.
     */
    @PostMapping("/profile/business-email/check")
    public LinkResponse checkLink(@AuthenticationPrincipal Jwt jwt, @RequestBody TokenRequest body) {
        return new LinkResponse(profiles.checkBusinessEmailLink(CurrentCoach.of(jwt), body.token()), null);
    }

    /** Confirm: the link's address becomes the business email and the link is used up. */
    @PostMapping("/profile/business-email/confirm")
    public LinkResponse confirm(@AuthenticationPrincipal Jwt jwt, @RequestBody TokenRequest body) {
        CoachProfileService.Confirmed c = profiles.confirmBusinessEmail(CurrentCoach.of(jwt), body.token());
        return new LinkResponse(c.address(), ProfileResponse.of(c.profile()));
    }

    /** "Use my login email instead" while a different business email waits for its link. */
    @PostMapping("/profile/business-email/use-login")
    public ProfileResponse useLoginEmail(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.of(profiles.useLoginEmail(CurrentCoach.of(jwt)));
    }
}
