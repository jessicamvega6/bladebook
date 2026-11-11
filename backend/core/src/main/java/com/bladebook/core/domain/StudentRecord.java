package com.bladebook.core.domain;

import java.time.Instant;

/**
 * A coach's skater record, {@code COACH#<coachId> / STUDENT#<studentId>} (ADR-MASTER section 3): the
 * skater's status with this coach, and copies of who the skater is and how to reach the family.
 */
public record StudentRecord(String coachId, String studentId, String clientId, StudentStatus status, String studentName,
                            boolean isMinor, ClientRelationship relationship, String clientName, String clientEmail,
                            String clientPhone, SkatingOrg skatingOrg, String registrationNumber, Instant signedUpAt) {

    public StudentRecord withStatus(StudentStatus next) {
        return new StudentRecord(coachId, studentId, clientId, next, studentName, isMinor, relationship, clientName,
                clientEmail, clientPhone, skatingOrg, registrationNumber, signedUpAt);
    }
}
