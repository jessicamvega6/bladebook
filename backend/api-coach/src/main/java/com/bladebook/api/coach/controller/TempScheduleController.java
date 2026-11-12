package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.config.LocalEventDispatcher;
import com.bladebook.api.coach.dto.ScheduleDtos.SaveRequest;
import com.bladebook.api.coach.dto.TempDtos.PreviewDto;
import com.bladebook.api.coach.dto.TempDtos.StatusDto;
import com.bladebook.api.coach.dto.TempDtos.TempDto;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.api.coach.security.RecentSignIn;
import com.bladebook.core.data.AccessContext;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.TempScheduleService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Time off, special schedules, the save preview and the save status (ADR-MASTER sections 6 and 9; Batch 6). A
 * preview writes nothing and needs no recent sign-in; a save needs a sign-in from the last 15 minutes.
 */
@RestController
@RequestMapping("/api/coach/schedule")
public class TempScheduleController {

    private final TempScheduleService temps;
    private final ScheduleChangeService change;
    private final RecentSignIn recentSignIn;
    private final ObjectProvider<LocalEventDispatcher> localEvents;

    public TempScheduleController(TempScheduleService temps, ScheduleChangeService change, RecentSignIn recentSignIn,
                                  ObjectProvider<LocalEventDispatcher> localEvents) {
        this.temps = temps;
        this.change = change;
        this.recentSignIn = recentSignIn;
        this.localEvents = localEvents;
    }

    /** What saving this weekly schedule would cancel and re-price. */
    @PostMapping("/preview")
    public PreviewDto previewWeekly(@AuthenticationPrincipal Jwt jwt, @RequestBody SaveRequest body) {
        return PreviewDto.of(change.previewWeekly(CurrentCoach.of(jwt), body.toTemplates()));
    }

    /** Every time off and special schedule that hasn't ended. */
    @GetMapping("/temps")
    public List<TempDto> temps(@AuthenticationPrincipal Jwt jwt) {
        return temps.upcoming(CurrentCoach.of(jwt)).stream().map(TempDto::of).toList();
    }

    @GetMapping("/temps/{tempId}")
    public TempDto temp(@AuthenticationPrincipal Jwt jwt, @PathVariable String tempId) {
        return TempDto.of(temps.get(CurrentCoach.of(jwt), tempId));
    }

    @PostMapping("/temps/preview")
    public PreviewDto previewTemp(@AuthenticationPrincipal Jwt jwt, @RequestBody TempDto body) {
        return PreviewDto.of(temps.preview(CurrentCoach.of(jwt), body.toTemp()));
    }

    /** A new one. */
    @PostMapping("/temps")
    public TempDto create(@AuthenticationPrincipal Jwt jwt, @RequestBody TempDto body) {
        return save(jwt, new TempDto(null, body.kind(), body.name(), null, body.startDate(), body.endDate(), body.templates()));
    }

    /** An edit: every date of the old version is replaced. */
    @PutMapping("/temps/{tempId}")
    public TempDto edit(@AuthenticationPrincipal Jwt jwt, @PathVariable String tempId, @RequestBody TempDto body) {
        return save(jwt, new TempDto(tempId, body.kind(), body.name(), null, body.startDate(), body.endDate(), body.templates()));
    }

    /** The newest schedule change's batch: applying, done, or stuck. */
    @GetMapping("/status")
    public StatusDto status(@AuthenticationPrincipal Jwt jwt) {
        return StatusDto.of(change.status(CurrentCoach.of(jwt)));
    }

    private TempDto save(Jwt jwt, TempDto body) {
        recentSignIn.require(jwt);
        AccessContext ctx = CurrentCoach.of(jwt);
        TempDto saved = TempDto.of(temps.save(ctx, body.toTemp()));
        localEvents.ifAvailable(e -> e.scheduleChanged(ctx, ChangeBatch.Source.DATE_OVERRIDE));
        return saved;
    }
}
