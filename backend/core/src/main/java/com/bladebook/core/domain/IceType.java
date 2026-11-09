package com.bladebook.core.domain;

/**
 * The ice types at Pelham Civic Center (PCC), the only rink in MVP (ADR-MASTER section 6). Each block
 * needs one. Families never see it; the rink fee will depend on it ({@code docs/Q_Rink-Fees.md}).
 */
public enum IceType {
    /** Birmingham Figure Skating Club (BFSC) freestyle ice. */
    BFSC_FREESTYLE,
    /** Stick and Puck (S&amp;P) ice. */
    STICK_AND_PUCK,
    /** Public ice. */
    PUBLIC;

    /** The stored name, or {@code null} when blank. */
    public static IceType parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim());
        } catch (IllegalArgumentException e) {
            throw DomainException.invalid("iceType", "Pick an ice type from the list.");
        }
    }
}
