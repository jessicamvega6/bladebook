package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.dto.AttendanceDtos.ContactDto;
import com.bladebook.api.coach.dto.AttendanceDtos.OutcomeBody;
import com.bladebook.api.coach.dto.AttendanceDtos.PastLessonDto;
import com.bladebook.api.coach.dto.AttendanceDtos.SkaterDto;
import com.bladebook.api.coach.dto.AttendanceDtos.TodayDto;
import com.bladebook.api.coach.dto.ScheduleDtos.CancelRequest;
import com.bladebook.api.coach.dto.ScheduleDtos.CancelResponse;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.service.AttendanceService;
import com.bladebook.core.service.CoachCancelService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Attendance (ADR-MASTER section 11). {@code /api/coach/rinkside/**} is the rinkside page, with its 4-hour session:
 * today's lessons, capture, contact details on a tap, and cancelling one lesson. {@code /api/coach/lessons} is the
 * coach website's Lessons page, where recorded attendance is corrected (R1).
 */
@RestController
public class AttendanceController {

    private final AttendanceService attendance;
    private final CoachCancelService cancels;

    public AttendanceController(AttendanceService attendance, CoachCancelService cancels) {
        this.attendance = attendance;
        this.cancels = cancels;
    }

    @GetMapping("/api/coach/rinkside/today")
    public TodayDto today(@AuthenticationPrincipal Jwt jwt) {
        return TodayDto.of(attendance.today(CurrentCoach.of(jwt)));
    }

    /** Present or no-show for one skater; a replay of something already recorded answers with what's recorded. */
    @PostMapping("/api/coach/rinkside/attendance")
    public SkaterDto record(@AuthenticationPrincipal Jwt jwt, @RequestBody OutcomeBody body) {
        return SkaterDto.of(attendance.record(CurrentCoach.of(jwt), date(body.date()), time(body.startTime()), body.studentId(),
                body.outcome(), body.outcomeAt()));
    }

    /** Shown for this tap only; logged. */
    @GetMapping("/api/coach/rinkside/contact/{studentId}")
    public ContactDto contact(@AuthenticationPrincipal Jwt jwt, @PathVariable String studentId) {
        return ContactDto.of(attendance.contact(CurrentCoach.of(jwt), studentId));
    }

    /** The check-in list's cancel: the same cancel as the website's, on the rinkside session. */
    @PostMapping("/api/coach/rinkside/cancel")
    public CancelResponse cancel(@AuthenticationPrincipal Jwt jwt, @RequestBody CancelRequest body) {
        return CancelResponse.of(cancels.cancel(CurrentCoach.of(jwt), body.toRequest()));
    }

    @GetMapping("/api/coach/lessons")
    public List<PastLessonDto> lessons(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
        return attendance.lessons(CurrentCoach.of(jwt), date(from), date(to)).stream().map(PastLessonDto::of).toList();
    }

    /** A correction: overwrites whatever was recorded. */
    @PutMapping("/api/coach/lessons/attendance")
    public SkaterDto correct(@AuthenticationPrincipal Jwt jwt, @RequestBody OutcomeBody body) {
        return SkaterDto.of(attendance.correct(CurrentCoach.of(jwt), date(body.date()), time(body.startTime()), body.studentId(), body.outcome()));
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
