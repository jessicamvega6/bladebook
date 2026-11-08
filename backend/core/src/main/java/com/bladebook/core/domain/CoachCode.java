package com.bladebook.core.domain;

import java.util.Locale;
import java.util.random.RandomGenerator;

/**
 * A coach code (ADR-MASTER section 4): 8 random characters from a set with no look-alikes, shown as
 * two groups of four ({@code 7K2Q-M9XT}). Holds nothing of the coach's name. Stored without the dash.
 */
public final class CoachCode {

    /** No 0, O, 1, I, L, 5, S or U. */
    public static final String ALPHABET = "ABCDEFGHJKMNPQRTVWXYZ2346789";
    public static final int LENGTH = 8;

    private static final String INVALID = "Coach codes are 8 letters and numbers, like 7K2Q-M9XT.";

    private final String value;

    private CoachCode(String value) {
        this.value = value;
    }

    /** A new random code. Pass a {@link java.security.SecureRandom} outside tests. */
    public static CoachCode generate(RandomGenerator random) {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return new CoachCode(sb.toString());
    }

    /** A code as typed: any case, with or without the dash, spaces ignored. */
    public static CoachCode parse(String typed) {
        if (typed == null) {
            throw DomainException.invalid("coachCode", INVALID);
        }
        String v = typed.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
        if (v.length() != LENGTH) {
            throw DomainException.invalid("coachCode", INVALID);
        }
        for (int i = 0; i < v.length(); i++) {
            if (ALPHABET.indexOf(v.charAt(i)) < 0) {
                throw DomainException.invalid("coachCode", INVALID);
            }
        }
        return new CoachCode(v);
    }

    /** The stored form, no dash: {@code 7K2QM9XT}. */
    public String value() {
        return value;
    }

    /** The shown form: {@code 7K2Q-M9XT}. */
    public String display() {
        return value.substring(0, 4) + "-" + value.substring(4);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof CoachCode && ((CoachCode) o).value.equals(value);
    }

    @Override
    public int hashCode() {
        return value.hashCode();
    }

    @Override
    public String toString() {
        return display();
    }
}
