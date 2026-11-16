package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.FinancialDtos.DownloadDto;
import com.bladebook.api.coach.dto.FinancialDtos.YearDto;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.service.FinancialService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The financial page and its summary download (ADR-MASTER section 12 "Financial page"; ADR-030). Gross only; rink
 * fees are Phase 2. The download carries no names, so it isn't a logged personal-data read (ADR-012).
 */
@RestController
@RequestMapping("/api/coach/finances")
public class FinancialController {

    private final FinancialService finances;

    public FinancialController(FinancialService finances) {
        this.finances = finances;
    }

    @GetMapping
    public YearDto year(@AuthenticationPrincipal Jwt jwt, @RequestParam String year) {
        return YearDto.of(finances.year(CurrentCoach.of(jwt), year(year)));
    }

    @GetMapping("/download")
    public DownloadDto download(@AuthenticationPrincipal Jwt jwt, @RequestParam String year) {
        return DownloadDto.of(finances.download(CurrentCoach.of(jwt), year(year)));
    }

    private static int year(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            throw DomainException.invalid("year", "Pick this year or last year.");
        }
    }
}
