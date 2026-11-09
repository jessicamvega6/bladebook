package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.config.LocalEventDispatcher;
import com.bladebook.api.coach.dto.ScheduleDtos.CalendarResponse;
import com.bladebook.api.coach.dto.ScheduleDtos.SaveRequest;
import com.bladebook.api.coach.dto.ScheduleDtos.ScheduleResponse;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.api.coach.security.RecentSignIn;
import com.bladebook.core.data.AccessContext;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.service.CalendarService;
import com.bladebook.core.service.ScheduleService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/** The weekly schedule editor and the coach's calendar (ADR-008, ADR-MASTER section 6). */
@RestController
@RequestMapping("/api/coach")
public class ScheduleController {

    private final ScheduleService schedules;
    private final CalendarService calendar;
    private final RecentSignIn recentSignIn;
    private final ObjectProvider<LocalEventDispatcher> localEvents;

    public ScheduleController(ScheduleService schedules, CalendarService calendar, RecentSignIn recentSignIn,
                              ObjectProvider<LocalEventDispatcher> localEvents) {
        this.schedules = schedules;
        this.calendar = calendar;
        this.recentSignIn = recentSignIn;
        this.localEvents = localEvents;
    }

    @GetMapping("/schedule")
    public ScheduleResponse schedule(@AuthenticationPrincipal Jwt jwt) {
        return ScheduleResponse.of(schedules.schedule(CurrentCoach.of(jwt)));
    }

    /**
     * Saves the week. Needs a sign-in from the last 15 minutes. The impact preview isn't built yet
     * (Batch 6), so nothing is shown before saving.
     */
    @PutMapping("/schedule")
    public ScheduleResponse save(@AuthenticationPrincipal Jwt jwt, @RequestBody SaveRequest body) {
        recentSignIn.require(jwt);
        AccessContext ctx = CurrentCoach.of(jwt);
        ScheduleResponse saved = ScheduleResponse.of(schedules.save(ctx, body.scheduleVersion(), body.toTemplates()));
        localEvents.ifAvailable(e -> e.scheduleChanged(ctx));
        return saved;
    }

    /** {@code from} to {@code to}, inclusive, at most six weeks: a month grid, a week or a day. */
    @GetMapping("/calendar")
    public CalendarResponse calendar(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
        return CalendarResponse.of(calendar.range(CurrentCoach.of(jwt), date("from", from), date("to", to)));
    }

    private static LocalDate date(String field, String s) {
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            throw DomainException.invalid(field, "Pick a date from the calendar.");
        }
    }
}
