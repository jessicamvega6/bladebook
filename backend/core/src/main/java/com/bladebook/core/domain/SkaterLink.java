package com.bladebook.core.domain;

/**
 * A family's link item, {@code CLIENT#<sub> / STUDENT#<coachId>#<studentId>} (ADR-MASTER section 3):
 * one skater with one coach, the skater's status with that coach, and the coach's name copied at sign-up.
 */
public record SkaterLink(String coachId, String studentId, String studentName, StudentStatus status,
                         String coachFirstName, String coachLastName) {
}
