package com.bladebook.core.domain;

/**
 * The organisation a skater's registration number comes from (ADR-MASTER section 3, {@code skatingOrg};
 * ADR-029). Skate Canada and Hockey Canada are Phase 2.
 */
public enum SkatingOrg {
    USFS("member number"),
    USA_HOCKEY("registration number"),
    LEARN_TO_SKATE_USA("member number");

    private final String numberName;

    SkatingOrg(String numberName) {
        this.numberName = numberName;
    }

    /** What the organisation calls its number, as the sign-up form labels it. */
    public String numberName() {
        return numberName;
    }

    public static SkatingOrg parse(String value) {
        if (value != null) {
            for (SkatingOrg o : values()) {
                if (o.name().equals(value)) {
                    return o;
                }
            }
        }
        throw DomainException.invalid("skatingOrg", "Choose the skater’s organization.");
    }
}
