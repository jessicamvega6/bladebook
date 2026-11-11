package com.bladebook.core.domain;

/**
 * A skater, {@code CLIENT#<sub> / SKATER#<studentId>} (ADR-MASTER section 3). One {@code studentId} for
 * life, whatever coaches they have.
 */
public record Skater(String studentId, String name, boolean isMinor, SkatingOrg skatingOrg, String registrationNumber) {
}
