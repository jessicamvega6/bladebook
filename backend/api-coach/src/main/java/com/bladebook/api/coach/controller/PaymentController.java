package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.PaymentDtos.RowDto;
import com.bladebook.api.coach.dto.PaymentDtos.SeatBody;
import com.bladebook.api.coach.dto.PaymentDtos.ViewDto;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.service.PaymentService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;

/** The coach's Payments page (ADR-MASTER section 12). BladeBook moves no money; the coach records it. */
@RestController
@RequestMapping("/api/coach/payments")
public class PaymentController {

    private final PaymentService payments;

    public PaymentController(PaymentService payments) {
        this.payments = payments;
    }

    @GetMapping
    public ViewDto list(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
        return ViewDto.of(payments.list(CurrentCoach.of(jwt), date(from), date(to)));
    }

    /** Marks paid, or changes how a paid lesson was paid. */
    @PostMapping("/paid")
    public RowDto paid(@AuthenticationPrincipal Jwt jwt, @RequestBody SeatBody b) {
        return RowDto.of(payments.markPaid(CurrentCoach.of(jwt), date(b.date()), time(b.startTime()), b.studentId(), b.paidVia()));
    }

    /** Final (R7). */
    @PostMapping("/waive")
    public RowDto waive(@AuthenticationPrincipal Jwt jwt, @RequestBody SeatBody b) {
        return RowDto.of(payments.waive(CurrentCoach.of(jwt), date(b.date()), time(b.startTime()), b.studentId()));
    }

    @PostMapping("/undo")
    public RowDto undo(@AuthenticationPrincipal Jwt jwt, @RequestBody SeatBody b) {
        return RowDto.of(payments.undo(CurrentCoach.of(jwt), date(b.date()), time(b.startTime()), b.studentId()));
    }

    private static LocalDate date(String s) {
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("date", "Pick a date from the calendar.");
        }
    }

    private static LocalTime time(String s) {
        try {
            return LocalTime.parse(s);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("startTime", "That time isn’t valid.");
        }
    }
}
