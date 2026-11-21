package com.bladebook.api.coach.dto;

import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.service.StudentService;

import java.util.List;

/** The Students and Waiting for approval tabs. Read-only contact details (A4). */
public final class StudentDtos {

    private StudentDtos() {
    }

    public record StudentDto(String studentId, String familyId, String status, String studentName, boolean isMinor,
                             String relationship, String clientName, String clientEmail, String clientPhone,
                             String skatingOrg, String registrationNumber, String signedUpAt) {
        public static StudentDto of(StudentRecord r) {
            return new StudentDto(r.studentId(), r.clientId(), r.status().name(), r.studentName(), r.isMinor(),
                    r.relationship().name(), r.clientName(), r.clientEmail(), r.clientPhone(), r.skatingOrg().name(),
                    r.registrationNumber(), r.signedUpAt().toString());
        }
    }

    public record StudentsResponse(List<StudentDto> active, List<StudentDto> pending) {
        public static StudentsResponse of(StudentService.Lists l) {
            return new StudentsResponse(l.active().stream().map(StudentDto::of).toList(),
                    l.pending().stream().map(StudentDto::of).toList());
        }
    }

    public record ApproveRequest(List<String> studentIds) {
    }
}
