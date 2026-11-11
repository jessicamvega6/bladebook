package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * The coach's Students and Waiting for approval tabs (ADR-MASTER section 5, "Approval"; design
 * coach/screens-students.js). The student list is read-only (A4): the family's profile is the source of
 * truth for contact details.
 */
public final class StudentService {

    static final int MAX_APPROVE = 50;

    /**
     * Approved students by their family contact's name, then the skater's name (owner, 2026-11-09), so a
     * family's skaters sit together; waiting ones in the order they signed up.
     */
    public record Lists(List<StudentRecord> active, List<StudentRecord> pending) {
    }

    private final StudentRepository students;

    public StudentService(StudentRepository students) {
        this.students = students;
    }

    public Lists list(AccessContext ctx) {
        List<StudentRecord> active = new ArrayList<>();
        List<StudentRecord> pending = new ArrayList<>();
        for (StudentRecord r : students.list(ctx)) {
            (r.status() == StudentStatus.ACTIVE ? active : pending).add(r);
        }
        active.sort(Comparator.comparing(StudentRecord::clientName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(StudentRecord::studentName, String.CASE_INSENSITIVE_ORDER));
        pending.sort(Comparator.comparing(StudentRecord::signedUpAt).thenComparing(StudentRecord::clientId)
                .thenComparing(StudentRecord::studentName, String.CASE_INSENSITIVE_ORDER));
        return new Lists(active, pending);
    }

    /** Approve one skater, or a whole family's ("Approve all"). Each is its own write. */
    public List<StudentRecord> approve(AccessContext ctx, List<String> studentIds) {
        List<String> ids = new ArrayList<>(new LinkedHashSet<>(studentIds == null ? List.of() : studentIds));
        if (ids.isEmpty() || ids.size() > MAX_APPROVE) {
            throw DomainException.invalid("studentIds", "Pick between 1 and " + MAX_APPROVE + " skaters to approve.");
        }
        List<StudentRecord> done = new ArrayList<>();
        for (String id : ids) {
            done.add(students.approve(ctx, id));
        }
        return done;
    }

    /** Deletes a waiting skater's record (ADR-MASTER section 5). */
    public StudentRecord decline(AccessContext ctx, String studentId) {
        return students.decline(ctx, studentId);
    }
}
