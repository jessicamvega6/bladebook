package com.bladebook.core.domain;

import java.util.Locale;

/**
 * Checks and cleans a skater's registration number (ADR-MASTER section 5, "Registration number";
 * ADR-029 decision 4, amended 2026-11-06). <b>Shape only:</b> it can't tell whether a number is real or
 * current, and a refusal names only the expected shape, never a hint of a lookup.
 *
 * <p>Cleaning drops spaces and uppercases; anything left that isn't a letter or digit is refused, not
 * dropped. The stored form is the cleaned one. The browser runs the same rules
 * ({@code web/src/shared/logic/registrationNumber.ts}); both pass {@code registration-number-cases.json}.
 *
 * <p>USA Hockey's season check digit is a <b>setting</b> because it changes every season (ADR-029):
 * the 1-based position among the number's nine digits, and the digit it must be. Where the setting
 * lives and who changes it is still open (ADR-029 Open), so it is off unless configured.
 */
public final class RegistrationNumbers {

    static final int MAX_MEMBER = 20;
    static final int HOCKEY_LENGTH = 14;
    static final int HOCKEY_DIGITS = 9;

    private static final String FIELD = "registrationNumber";
    private static final String ONLY_LETTERS_AND_DIGITS = "Use letters and numbers only.";
    private static final String TOO_LONG = "That’s too long for a member number.";
    private static final String HOCKEY_SHAPE = "USA Hockey numbers are 14 characters: 9 digits and 5 letters.";
    private static final String NOT_THIS_SEASON = "That isn’t this season’s USA Hockey number. Check the skater’s current card.";

    private final Integer checkPosition;
    private final Integer checkDigit;

    private RegistrationNumbers(Integer checkPosition, Integer checkDigit) {
        this.checkPosition = checkPosition;
        this.checkDigit = checkDigit;
    }

    public static RegistrationNumbers withoutSeasonCheck() {
        return new RegistrationNumbers(null, null);
    }

    /**
     * @param position the check digit's place among the nine digits, 1 to 9
     * @param digit    what it must be this season, 0 to 9
     */
    public static RegistrationNumbers withSeasonCheck(int position, int digit) {
        if (position < 1 || position > HOCKEY_DIGITS || digit < 0 || digit > 9) {
            throw new IllegalArgumentException("USA Hockey check digit: position 1-9, digit 0-9");
        }
        return new RegistrationNumbers(position, digit);
    }

    /**
     * @return the cleaned number to store
     * @throws DomainException INVALID on {@code registrationNumber} (or {@code skatingOrg} when it's missing)
     */
    public String clean(SkatingOrg org, String typed) {
        if (org == null) {
            throw DomainException.invalid("skatingOrg", "Choose the skater’s organization.");
        }
        String c = typed == null ? "" : typed.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        if (c.isEmpty()) {
            throw DomainException.invalid(FIELD, "Enter the skater’s " + org.numberName() + ".");
        }
        int digits = 0;
        for (int i = 0; i < c.length(); i++) {
            char ch = c.charAt(i);
            boolean digit = ch >= '0' && ch <= '9';
            if (!digit && !(ch >= 'A' && ch <= 'Z')) {
                throw DomainException.invalid(FIELD, ONLY_LETTERS_AND_DIGITS);
            }
            digits += digit ? 1 : 0;
        }
        if (org != SkatingOrg.USA_HOCKEY) {
            if (c.length() > MAX_MEMBER) {
                throw DomainException.invalid(FIELD, TOO_LONG);
            }
            return c;
        }
        if (c.length() != HOCKEY_LENGTH || digits != HOCKEY_DIGITS) {
            throw DomainException.invalid(FIELD, HOCKEY_SHAPE);
        }
        if (checkPosition != null && nthDigit(c, checkPosition) != checkDigit) {
            throw DomainException.invalid(FIELD, NOT_THIS_SEASON);
        }
        return c;
    }

    private static int nthDigit(String c, int n) {
        int seen = 0;
        for (int i = 0; i < c.length(); i++) {
            char ch = c.charAt(i);
            if (ch >= '0' && ch <= '9' && ++seen == n) {
                return ch - '0';
            }
        }
        throw new IllegalStateException("fewer digits than checked");
    }
}
