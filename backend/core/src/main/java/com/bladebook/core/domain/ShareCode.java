package com.bladebook.core.domain;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;
import java.util.random.RandomGenerator;

/**
 * A skater's share code (ADR-MASTER section 3, "Share code"; ADR-026 d4): the first 3 letters of the skater's first
 * name (uppercased, accents dropped, anything but A–Z skipped, filled from the last name when the first is shorter),
 * a dash, then 5 random characters from the coach code's set: {@code MIA-4K7QX}. Typed ignoring case and the dash.
 * Issued once, when the skater is created, and never changed.
 *
 * <p>A name with fewer than 3 letters A–Z in all is padded with {@code X} so every code has the same shape (not in the
 * ADR; settled in Batch 11).
 */
public final class ShareCode {

    public static final int RANDOM_LENGTH = 5;

    private ShareCode() {
    }

    /** A new code for a skater with this full name. Pass a {@link java.security.SecureRandom} outside tests. */
    public static String generate(String fullName, RandomGenerator random) {
        StringBuilder sb = new StringBuilder(prefix(fullName)).append('-');
        for (int i = 0; i < RANDOM_LENGTH; i++) {
            sb.append(CoachCode.ALPHABET.charAt(random.nextInt(CoachCode.ALPHABET.length())));
        }
        return sb.toString();
    }

    /** The three letters a code starts with. */
    static String prefix(String fullName) {
        String plain = Normalizer.normalize(fullName == null ? "" : fullName, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT).replaceAll("[^A-Z]", "");
        StringBuilder sb = new StringBuilder(plain.length() > 3 ? plain.substring(0, 3) : plain);
        while (sb.length() < 3) {
            sb.append('X');
        }
        return sb.toString();
    }

    /** A code as typed, in its stored form ({@code MIA-4K7QX}), or empty when it can't be a share code. */
    public static Optional<String> normalise(String typed) {
        if (typed == null) {
            return Optional.empty();
        }
        String v = typed.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
        if (v.length() != 3 + RANDOM_LENGTH) {
            return Optional.empty();
        }
        for (int i = 0; i < 3; i++) {
            if (v.charAt(i) < 'A' || v.charAt(i) > 'Z') {
                return Optional.empty();
            }
        }
        for (int i = 3; i < v.length(); i++) {
            if (CoachCode.ALPHABET.indexOf(v.charAt(i)) < 0) {
                return Optional.empty();
            }
        }
        return Optional.of(v.substring(0, 3) + "-" + v.substring(3));
    }
}
