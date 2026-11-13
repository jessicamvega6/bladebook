package com.bladebook.core.domain;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Currency;
import java.util.List;
import java.util.Locale;

/**
 * Dates, times, lengths and amounts as the email templates show them. SES fills in placeholders and formats nothing, so
 * the sender passes finished strings, in the coach's time zone and currency (design/harbor/email/README.md).
 */
public final class EmailFormat {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.US);

    private EmailFormat() {
    }

    /** {@code Wed, Oct 21}. */
    public static String date(LocalDate d) {
        return DATE.format(d);
    }

    /** {@code 6:30 AM}. */
    public static String time(LocalTime t) {
        return TIME.format(t);
    }

    /** {@code Sun, Oct 18 at 6:00 AM}, in the coach's zone. */
    public static String dateTime(Instant at, String zone) {
        ZonedDateTime local = at.atZone(ZoneId.of(zone));
        return date(local.toLocalDate()) + " at " + time(local.toLocalTime());
    }

    /** {@code 30 min}. */
    public static String length(int minutes) {
        return minutes + " min";
    }

    /** {@code $50}, or {@code $25.01} when there are cents; another currency's own symbol ({@code CA$50}). */
    public static String money(long minor, String currency) {
        Currency c = Currency.getInstance(currency);
        NumberFormat f = NumberFormat.getNumberInstance(Locale.US);
        boolean whole = minor % 100 == 0;
        f.setMinimumFractionDigits(whole ? 0 : 2);
        f.setMaximumFractionDigits(whole ? 0 : 2);
        return c.getSymbol(Locale.US) + f.format(BigDecimal.valueOf(minor, 2));
    }

    /** {@code Mia}, {@code Mia and Noah}, {@code Mia, Noah and Ava}. */
    public static String and(List<String> names) {
        if (names.size() <= 1) {
            return names.isEmpty() ? "" : names.get(0);
        }
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    /** The first word of a name: {@code Mia} from {@code Mia Chen} or {@code Mia C.}. */
    public static String first(String name) {
        String n = name == null ? "" : name.trim();
        int sp = n.indexOf(' ');
        return sp < 0 ? n : n.substring(0, sp);
    }

    /**
     * The coach's payment instructions as the template's {@code instructionLines}: one entry per non-blank line, so a
     * line break the coach typed survives the HTML (each line is still escaped by SES).
     */
    public static List<String> lines(String text) {
        if (text == null) {
            return List.of();
        }
        return Arrays.stream(text.split("\\R")).map(String::strip).filter(l -> !l.isEmpty()).toList();
    }
}
