package com.bladebook.core.domain;

import java.util.Locale;

/** A skater's display form, "Mia R.": the first name and the last name's initial (ADR-MASTER sections 7 and 8). */
public final class DisplayName {

    private DisplayName() {
    }

    public static String of(String fullName) {
        String[] words = fullName.trim().split("\\s+");
        if (words.length < 2) {
            return words[0];
        }
        String last = words[words.length - 1];
        return words[0] + " " + last.substring(0, 1).toUpperCase(Locale.ROOT) + ".";
    }
}
