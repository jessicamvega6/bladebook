package com.bladebook.api.client.controller;

import com.bladebook.api.client.config.LocalEventDispatcher;
import com.bladebook.api.client.dto.FamilyDtos.AddCoachBody;
import com.bladebook.api.client.dto.FamilyDtos.AddSkaterBody;
import com.bladebook.api.client.dto.FamilyDtos.ContactBody;
import com.bladebook.api.client.dto.FamilyDtos.FamilyResponse;
import com.bladebook.api.client.dto.FamilyDtos.RegistrationBody;
import com.bladebook.api.client.security.CurrentFamily;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.service.FamilyService;
import com.bladebook.core.service.RegistrationService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Registration, and the family's own account for Home and Profile (ADR-MASTER section 5). */
@RestController
public class FamilyController {

    private final RegistrationService registration;
    private final FamilyService families;
    private final ObjectProvider<LocalEventDispatcher> localEvents;

    public FamilyController(RegistrationService registration, FamilyService families,
                            ObjectProvider<LocalEventDispatcher> localEvents) {
        this.registration = registration;
        this.families = families;
        this.localEvents = localEvents;
    }

    @PostMapping("/api/client/registration")
    @ResponseStatus(HttpStatus.CREATED)
    public FamilyResponse register(@AuthenticationPrincipal Jwt jwt, @RequestBody RegistrationBody body) {
        return FamilyResponse.of(registration.register(CurrentFamily.of(jwt), CurrentFamily.loginEmail(jwt), body.toRequest()));
    }

    @GetMapping("/api/client/me")
    public FamilyResponse me(@AuthenticationPrincipal Jwt jwt) {
        return FamilyResponse.of(families.view(CurrentFamily.of(jwt)));
    }

    /** Name and mobile number. Each coach's copy follows through consumer-family-sync. */
    @PutMapping("/api/client/me/contact")
    public FamilyResponse contact(@AuthenticationPrincipal Jwt jwt, @RequestBody ContactBody body) {
        ClientContext ctx = CurrentFamily.of(jwt);
        FamilyResponse r = FamilyResponse.of(families.updateContact(ctx, body.firstName(), body.lastName(), body.phone()));
        localEvents.ifAvailable(e -> e.familyChanged(ctx));
        return r;
    }

    /** Profile → Add a skater (A9; ADR-025 item k): waiting for each approved coach picked, or with none yet. */
    @PostMapping("/api/client/me/skaters")
    public FamilyResponse addSkater(@AuthenticationPrincipal Jwt jwt, @RequestBody AddSkaterBody body) {
        return FamilyResponse.of(registration.addSkater(CurrentFamily.of(jwt), body.toRequest()));
    }

    /** Profile → Add a coach (ADR-025 d2): each chosen skater waits for that coach alone. */
    @PostMapping("/api/client/me/coaches")
    public FamilyResponse addCoach(@AuthenticationPrincipal Jwt jwt, @RequestBody AddCoachBody body) {
        return FamilyResponse.of(registration.addCoach(CurrentFamily.of(jwt), body.coachCode(), body.studentIds()));
    }
}
