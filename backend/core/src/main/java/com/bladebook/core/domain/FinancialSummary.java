package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The coach's financial page and its summary download (ADR-MASTER section 12 "Financial page"; ADR-030 as amended
 * 2026-11-12; FeatureDecriptions/Coach Financial Page.md). Gross is money received: seats marked paid, at their share,
 * which in MVP includes a no-show marked paid (the missed-lesson fee collected). Waived and unpaid are left out. A
 * lesson counts in the year and month of its lesson date. Rink fees are Phase 2.
 *
 * <p>A finished year is closed: it closes at midnight starting January 1 in the coach's time zone, and a lesson from
 * it marked paid after that counts in no year (settled in Batch 12; the owner may override).
 */
public final class FinancialSummary {

    /** One skater's lesson that has happened. {@code paidAt} only when paid. */
    public record Entry(LocalDate lessonDate, int amountMinor, String currency, Payment.Status status, Instant paidAt) {
    }

    /** One month. {@code hasLessons}: any lesson that happened, paid or not. Amounts per currency, never added across. */
    public record Month(YearMonth month, boolean hasLessons, int paidLessons, Map<String, Long> gross, Map<String, Long> unpaid) {

        public Month {
            gross = Map.copyOf(gross);
            unpaid = Map.copyOf(unpaid);
        }
    }

    /** A year: January to this month (this year) or to December (a closed year). */
    public record Summary(int year, boolean closed, LocalDate today, List<Month> months, int paidLessons, Map<String, Long> gross,
                          Map<String, Long> unpaid) {

        public Summary {
            months = List.copyOf(months);
            gross = Map.copyOf(gross);
            unpaid = Map.copyOf(unpaid);
        }
    }

    static final String WHICH_YEAR = "Pick this year or last year.";

    private FinancialSummary() {
    }

    /** MVP shows this year and downloads this year or last; past years on screen are Phase 2. */
    public static void checkYear(int year, LocalDate today) {
        if (year != today.getYear() && year != today.getYear() - 1) {
            throw DomainException.invalid("year", WHICH_YEAR);
        }
    }

    public static Summary of(int year, List<Entry> entries, ZoneId coachZone, LocalDate today) {
        boolean closed = year < today.getYear();
        Instant closedAt = LocalDate.of(year + 1, 1, 1).atStartOfDay(coachZone).toInstant();
        int last = closed ? 12 : today.getMonthValue();
        List<Month> months = new ArrayList<>();
        int paidLessons = 0;
        List<Payment.Amount> gross = new ArrayList<>();
        List<Payment.Amount> unpaid = new ArrayList<>();
        for (int m = 1; m <= last; m++) {
            YearMonth ym = YearMonth.of(year, m);
            boolean has = false;
            int paid = 0;
            List<Payment.Amount> g = new ArrayList<>();
            List<Payment.Amount> u = new ArrayList<>();
            for (Entry e : entries) {
                if (!YearMonth.from(e.lessonDate()).equals(ym)) {
                    continue;
                }
                has = true;
                Payment.Amount a = new Payment.Amount(e.amountMinor(), e.currency());
                if (e.status() == Payment.Status.PAID && (e.paidAt() == null || e.paidAt().isBefore(closedAt))) {
                    paid++;
                    g.add(a);
                } else if (e.status() == Payment.Status.UNPAID) {
                    u.add(a);
                }
            }
            months.add(new Month(ym, has, paid, Payment.totals(g), Payment.totals(u)));
            paidLessons += paid;
            gross.addAll(g);
            unpaid.addAll(u);
        }
        return new Summary(year, closed, today, months, paidLessons, Payment.totals(gross), Payment.totals(unpaid));
    }

    /**
     * The summary download: one row per month with the paid lessons and gross received, then the year's totals. No
     * skater names or personal data. Amounts in {@code currency}, as decimals.
     */
    public static String csv(Summary s, String currency) {
        StringBuilder out = new StringBuilder();
        line(out, "Month", "Paid lessons", "Gross received (" + currency + ")");
        for (Month m : s.months()) {
            String label = m.month().getMonth().getDisplayName(TextStyle.FULL, Locale.US) + " " + s.year();
            if (!s.closed() && m.month().equals(YearMonth.from(s.today()))) {
                label += " (to " + s.today().getMonth().getDisplayName(TextStyle.SHORT, Locale.US) + " " + s.today().getDayOfMonth() + ")";
            }
            line(out, label, String.valueOf(m.paidLessons()), decimal(m.gross().getOrDefault(currency, 0L), currency));
        }
        line(out, s.year() + (s.closed() ? " total" : " to date"), String.valueOf(s.paidLessons()),
                decimal(s.gross().getOrDefault(currency, 0L), currency));
        return out.toString();
    }

    public static String fileName(int year) {
        return "bladebook-summary-" + year + ".csv";
    }

    private static void line(StringBuilder out, String... cells) {
        out.append(String.join(",", cells)).append("\r\n");
    }

    private static String decimal(long minor, String currency) {
        int digits = Currency.getInstance(currency).getDefaultFractionDigits();
        return java.math.BigDecimal.valueOf(minor, digits).toPlainString();
    }
}
