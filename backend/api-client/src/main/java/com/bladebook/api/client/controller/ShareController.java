package com.bladebook.api.client.controller;

import com.bladebook.api.client.dto.ShareDtos.AnsweredDto;
import com.bladebook.api.client.dto.ShareDtos.FilledDto;
import com.bladebook.api.client.dto.ShareDtos.FreedPlaceBody;
import com.bladebook.api.client.dto.ShareDtos.InvitationDto;
import com.bladebook.api.client.dto.ShareDtos.InviteBody;
import com.bladebook.api.client.dto.ShareDtos.ShareCheckBody;
import com.bladebook.api.client.dto.ShareDtos.ShareCheckResponse;
import com.bladebook.api.client.dto.ShareDtos.WaitingBody;
import com.bladebook.api.client.security.CurrentFamily;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.service.CancellationService;
import com.bladebook.core.service.ShareService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;

/** Shared lessons on the family website (ADR-MASTER section 8; Batch 11). Every call acts on the family's own seats. */
@RestController
public class ShareController {

    private final ShareService shares;
    private final CancellationService cancellations;

    public ShareController(ShareService shares, CancellationService cancellations) {
        this.shares = shares;
        this.cancellations = cancellations;
    }

    /** ADR-033 d2a: the share step's check, before the booking can continue. Advice for the screen only. */
    @PostMapping("/api/client/share-check")
    public ShareCheckResponse check(@AuthenticationPrincipal Jwt jwt, @RequestBody ShareCheckBody body) {
        return ShareCheckResponse.of(shares.check(CurrentFamily.of(jwt), body.coachId(), body.shareCode()));
    }

    /** Invitations to the family's skaters, open or expired. */
    @GetMapping("/api/client/invitations")
    public List<InvitationDto> invitations(@AuthenticationPrincipal Jwt jwt) {
        return shares.invitations(CurrentFamily.of(jwt)).stream().map(InvitationDto::of).toList();
    }

    /** Go ahead: each date that hasn't started joins. */
    @PostMapping("/api/client/invitations/accept")
    public AnsweredDto accept(@AuthenticationPrincipal Jwt jwt, @RequestBody InviteBody body) {
        return AnsweredDto.of(shares.accept(CurrentFamily.of(jwt), id(body)));
    }

    @PostMapping("/api/client/invitations/decline")
    public AnsweredDto decline(@AuthenticationPrincipal Jwt jwt, @RequestBody InviteBody body) {
        return AnsweredDto.of(shares.decline(CurrentFamily.of(jwt), id(body)));
    }

    /** The inviting family withdraws an invitation the other family hasn't answered. */
    @PostMapping("/api/client/invitations/withdraw")
    public AnsweredDto withdraw(@AuthenticationPrincipal Jwt jwt, @RequestBody InviteBody body) {
        return AnsweredDto.of(shares.withdraw(CurrentFamily.of(jwt), id(body)));
    }

    /** The staying family keeps one or more dates private at the full price. */
    @PostMapping("/api/client/bookings/keep")
    public AnsweredDto keep(@AuthenticationPrincipal Jwt jwt, @RequestBody WaitingBody body) {
        return AnsweredDto.of(shares.keep(CurrentFamily.of(jwt), body.coachId(), body.studentId(), time(body.startTime()), dates(body.dates())));
    }

    /** The staying family cancels one or more dates with no charge: one batch, each date re-checked. */
    @PostMapping("/api/client/bookings/cancel-waiting")
    public AnsweredDto cancelWaiting(@AuthenticationPrincipal Jwt jwt, @RequestBody WaitingBody body) {
        return AnsweredDto.of(cancellations.cancelWaiting(CurrentFamily.of(jwt), body.coachId(), body.studentId(), dates(body.dates()),
                time(body.startTime())));
    }

    /** A freed place takes a skater for that one lesson. */
    @PostMapping("/api/client/bookings/invite")
    public FilledDto invite(@AuthenticationPrincipal Jwt jwt, @RequestBody FreedPlaceBody body) {
        return FilledDto.of(shares.fillFreedPlace(CurrentFamily.of(jwt), body.coachId(), body.studentId(), date(body.date()),
                time(body.startTime()), body.shareCode()));
    }

    private static String id(InviteBody body) {
        if (body == null || body.inviteId() == null || !body.inviteId().matches("^[A-Za-z0-9-]{1,64}$")) {
            throw DomainException.invalid("inviteId", "That invitation couldn’t be found.");
        }
        return body.inviteId();
    }

    private static List<LocalDate> dates(List<String> ds) {
        if (ds == null || ds.isEmpty() || ds.size() > 60) {
            throw DomainException.invalid("dates", "Pick at least one date.");
        }
        return ds.stream().map(ShareController::date).toList();
    }

    private static LocalDate date(String v) {
        try {
            return LocalDate.parse(v);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("date", "That date isn’t valid.");
        }
    }

    private static LocalTime time(String v) {
        try {
            return LocalTime.parse(v);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("startTime", "That time isn’t valid.");
        }
    }
}
