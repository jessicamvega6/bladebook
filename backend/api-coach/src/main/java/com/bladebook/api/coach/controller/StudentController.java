package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.config.LocalEventDispatcher;
import com.bladebook.api.coach.dto.StudentDtos.ApproveRequest;
import com.bladebook.api.coach.dto.StudentDtos.StudentsResponse;
import com.bladebook.api.coach.security.CurrentCoach;
import com.bladebook.core.data.AccessContext;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.service.StudentService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The coach's students: the list, approve (one or a family's "Approve all") and decline (ADR-MASTER section 5,
 * "Approval"). api-coach writes only the {@code STUDENT#} record; the family's link follows through
 * consumer-student-link, called in-process locally.
 */
@RestController
public class StudentController {

    private final StudentService students;
    private final ObjectProvider<LocalEventDispatcher> localEvents;

    public StudentController(StudentService students, ObjectProvider<LocalEventDispatcher> localEvents) {
        this.students = students;
        this.localEvents = localEvents;
    }

    @GetMapping("/api/coach/students")
    public StudentsResponse list(@AuthenticationPrincipal Jwt jwt) {
        return StudentsResponse.of(students.list(CurrentCoach.of(jwt)));
    }

    @PostMapping("/api/coach/students/approve")
    public StudentsResponse approve(@AuthenticationPrincipal Jwt jwt, @RequestBody ApproveRequest body) {
        AccessContext ctx = CurrentCoach.of(jwt);
        List<StudentRecord> done = students.approve(ctx, body.studentIds());
        localEvents.ifAvailable(e -> done.forEach(e::studentApproved));
        return StudentsResponse.of(students.list(ctx));
    }

    @DeleteMapping("/api/coach/students/{studentId}")
    public StudentsResponse decline(@AuthenticationPrincipal Jwt jwt, @PathVariable String studentId) {
        AccessContext ctx = CurrentCoach.of(jwt);
        StudentRecord gone = students.decline(ctx, studentId);
        localEvents.ifAvailable(e -> e.studentDeclined(gone));
        return StudentsResponse.of(students.list(ctx));
    }
}
