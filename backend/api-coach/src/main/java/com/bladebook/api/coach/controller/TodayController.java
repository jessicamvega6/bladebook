package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.TodayDtos.TodayDto;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.core.service.TodayService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The coach website's Today page (Batch 22, G-6): today's lessons and the week and unpaid figures. Read only. */
@RestController
public class TodayController {

    private final TodayService today;

    public TodayController(TodayService today) {
        this.today = today;
    }

    @GetMapping("/api/coach/today")
    public TodayDto today(@AuthenticationPrincipal Jwt jwt) {
        return TodayDto.of(today.today(CurrentCoach.of(jwt)));
    }
}
