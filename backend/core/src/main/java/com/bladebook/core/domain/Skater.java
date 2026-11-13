package com.bladebook.core.domain;

/**
 * A skater, {@code CLIENT#<sub> / SKATER#<studentId>} (ADR-MASTER section 3). One {@code studentId} for
 * life, whatever coaches they have. {@code shareCode} is issued by {@code consumer-family-sync} once the skater exists
 * (ADR-MASTER section 3, "Share code"), so it is {@code null} until then.
 */
public record Skater(String studentId, String name, boolean isMinor, SkatingOrg skatingOrg, String registrationNumber,
                     String shareCode) {

    /** A skater with no share code yet. */
    public Skater(String studentId, String name, boolean isMinor, SkatingOrg skatingOrg, String registrationNumber) {
        this(studentId, name, isMinor, skatingOrg, registrationNumber, null);
    }
}
