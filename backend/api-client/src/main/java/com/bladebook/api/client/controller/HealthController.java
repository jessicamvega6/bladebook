package com.bladebook.api.client.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** No token needed (ADR-023 d7, amended 2026-10-24). Says nothing about the system beyond "up". */
@RestController
public class HealthController {

    @GetMapping("/api/client/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
