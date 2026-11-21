package com.bladebook.api.client.controller;

import com.bladebook.api.client.dto.FamilyDtos.CoachLookupResponse;
import com.bladebook.api.client.exception.NoSuchCoach;
import com.bladebook.core.service.CodeLookupService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Step 1 of sign-up, before any account exists: no token (ADR-023 d7). Returns the coach's name only. On
 * AWS the Web Application Firewall rate-limits this route (ADR-MASTER section 17); locally nothing does.
 */
@RestController
public class CodeLookupController {

    private final CodeLookupService lookup;

    public CodeLookupController(CodeLookupService lookup) {
        this.lookup = lookup;
    }

    @GetMapping("/api/client/coach-codes/{code}")
    public CoachLookupResponse lookup(@PathVariable String code) {
        return lookup.lookup(code).map(CoachLookupResponse::of).orElseThrow(NoSuchCoach::new);
    }
}
