package com.bladebook.core.data;

import com.bladebook.core.domain.StudentStatus;

/**
 * A skater the calling family is linked to and {@code ACTIVE} with, for one coach (ADR-MASTER section 16,
 * "The write link check"). Every repository method that writes into a coach's partition for a family takes
 * one. Its constructor is package-private: the only source is {@link ClientLinks#requireActive}, which reads
 * the family's own link.
 */
public final class LinkedSkater {

    private final String clientId;
    private final String coachId;
    private final String studentId;
    private final String studentName;
    private final String coachFirstName;

    LinkedSkater(String clientId, String coachId, String studentId, String studentName, String coachFirstName) {
        this.clientId = clientId;
        this.coachId = coachId;
        this.studentId = studentId;
        this.studentName = studentName;
        this.coachFirstName = coachFirstName;
    }

    public String clientId() {
        return clientId;
    }

    public String coachId() {
        return coachId;
    }

    public String studentId() {
        return studentId;
    }

    /** The skater's full name, from the family's own link. */
    public String studentName() {
        return studentName;
    }

    public String coachFirstName() {
        return coachFirstName;
    }

    /** The coach, as an {@code ACTIVE} {@link LinkedCoach}: an ACTIVE skater makes the family ACTIVE with them. */
    public LinkedCoach coach() {
        return new LinkedCoach(coachId, StudentStatus.ACTIVE);
    }

    @Override
    public String toString() {
        return "LinkedSkater[" + studentId + " with " + coachId + "]";
    }
}
