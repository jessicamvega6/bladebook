package com.bladebook.core.domain;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Field rules for the coach profile. Each method trims, checks and returns the value to store, or
 * throws {@link DomainException} naming the field. Messages never echo what was typed.
 */
public final class ProfileRules {

    /**
     * The time zones the website offers (design/harbor/coach, Profile → Details). Stored as IANA
     * names (ADR-016 d6); the website shows labels such as "Central — Chicago".
     */
    public static final Set<String> TIMEZONES = Set.of(
            "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
            "America/Toronto", "America/Edmonton", "America/Vancouver");

    static final int MAX_NAME = 50;
    static final int MAX_EMAIL = 254;
    static final int MAX_INSTRUCTIONS = 1000;

    // One @, no spaces, a dot in the domain, no empty domain labels.
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$");
    private static final Pattern PHONE_CHARS = Pattern.compile("^[0-9 +().-]+$");

    private ProfileRules() {
    }

    public static String name(String field, String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) {
            throw DomainException.invalid(field, "Enter a name.");
        }
        if (v.length() > MAX_NAME) {
            throw DomainException.invalid(field, "Keep the name to " + MAX_NAME + " characters.");
        }
        if (v.chars().anyMatch(Character::isISOControl)) {
            throw DomainException.invalid(field, "The name has a character it can't hold.");
        }
        return v;
    }

    public static String email(String field, String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty() || v.length() > MAX_EMAIL || !EMAIL.matcher(v).matches()) {
            throw DomainException.invalid(field, "Enter an email address like name@example.com.");
        }
        return v;
    }

    /** Email addresses compare without case. */
    public static boolean sameAddress(String a, String b) {
        return a != null && b != null && a.trim().toLowerCase(Locale.ROOT).equals(b.trim().toLowerCase(Locale.ROOT));
    }

    /** Optional. 10 to 15 digits, with spaces, dashes, dots, brackets or a leading +. */
    public static String phone(String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) {
            return null;
        }
        long digits = v.chars().filter(Character::isDigit).count();
        if (!PHONE_CHARS.matcher(v).matches() || digits < 10 || digits > 15) {
            throw DomainException.invalid("phone", "Enter a phone number with its area code, like (205) 555-0142.");
        }
        return v;
    }

    public static String timezone(String value) {
        if (value == null || !TIMEZONES.contains(value)) {
            throw DomainException.invalid("coachTimezone", "Choose a time zone from the list.");
        }
        return value;
    }

    public static CoachProfile.Currency currency(String value) {
        if ("USD".equals(value)) {
            return CoachProfile.Currency.USD;
        }
        if ("CAD".equals(value)) {
            return CoachProfile.Currency.CAD;
        }
        throw DomainException.invalid("currency", "Choose USD or CAD.");
    }

    /** Optional free text. Newlines and tabs are kept; other control characters are refused. */
    public static String instructions(String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) {
            return null;
        }
        if (v.length() > MAX_INSTRUCTIONS) {
            throw DomainException.invalid("paymentInstructions", "Keep this to " + MAX_INSTRUCTIONS + " characters.");
        }
        if (v.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t')) {
            throw DomainException.invalid("paymentInstructions", "This has a character it can't hold.");
        }
        return v;
    }
}
