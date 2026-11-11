package com.bladebook.core.domain;

/** Who a family's account books for (ADR-MASTER section 3, {@code clientRelationship}). */
public enum ClientRelationship {
    /** An adult skating themselves: one skater, the account holder. */
    SELF,
    /** A guardian booking for children under 18 (A7: guardians add minors only). */
    GUARDIAN;

    public static ClientRelationship parse(String value) {
        for (ClientRelationship r : values()) {
            if (r.name().equals(value)) {
                return r;
            }
        }
        throw DomainException.invalid("relationship", "Choose who the lessons are for.");
    }
}
