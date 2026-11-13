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
 * <p>A finished year is closed: it closes at midnight starting January 1 in the coach's time zone, and nothing paid
 * after that changes it. A lesson from a closed year marked paid later counts in the year and month it was marked
 * paid, flagged as for an earlier year ({@code earlierLessons}, {@code earlierGross}; owner, 2026-11-13).
 */
public final class FinancialSummary {

    /** One skater's lesson that has happened. {@code paidAt} only when paid. */
    public record Entry(LocalDate lessonDate, int amountMinor, String currency, Payment.Status status, Instant paidAt) {
    }

    /**
     * One month. {@code hasLessons}: any of its own lessons that happened, paid or not. {@code paidLessons} and
     * {@code gross} include the earlier years' lessons paid this month, which {@code earlierLessons} and
     * {@code earlierGross} count again on their own. Amounts per currency, never added across.
     */
    public record Month(YearMonth month, boolean hasLessons, int paidLessons, Map<String, Long> gross, Map<String, Long> unpaid,
                        int earlierLessons, Map<String, Long> earlierGross) {

        public Month {
            gross = Map.copyOf(gross);
            unpaid = Map.copyOf(unpaid);
            earlierGross = Map.copyOf(earlierGross);
        }
    }

    /** A year: January to this month (this year) or to December (a closed year). */
    public record Summary(int year, boolean closed, LocalDate today, List<Month> months, int paidLessons, Map<String, Long> gross,
                          Map<String, Long> unpaid, int earlierLessons, Map<String, Long> earlierGross) {

        public Summary {
            months = List.copyOf(months);
            gross = Map.copyOf(gross);
            unpaid = Map.copyOf(unpaid);
            earlierGross = Map.copyOf(earlierGross);
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

    /**
     * {@code entries}: the year's own lessons, and any earlier year's lessons that might have been paid during it
     * (they count only if marked paid between this year's start and its close).
     */
    public static Summary of(int year, List<Entry> entries, ZoneId coachZone, LocalDate today) {
        boolean closed = year < today.getYear();
        Instant opensAt = LocalDate.of(year, 1, 1).atStartOfDay(coachZone).toInstant();
        Instant closedAt = LocalDate.of(year + 1, 1, 1).atStartOfDay(coachZone).toInstant();
        int last = closed ? 12 : today.getMonthValue();
        List<Month> months = new ArrayList<>();
        int paidLessons = 0;
        int earlierLessons = 0;
        List<Payment.Amount> gross = new ArrayList<>();
        List<Payment.Amount> unpaid = new ArrayList<>();
        List<Payment.Amount> earlierGross = new ArrayList<>();
        for (int m = 1; m <= last; m++) {
            YearMonth ym = YearMonth.of(year, m);
            boolean has = false;
            int paid = 0;
            int earlier = 0;
            List<Payment.Amount> g = new ArrayList<>();
            List<Payment.Amount> u = new ArrayList<>();
            List<Payment.Amount> eg = new ArrayList<>();
            for (Entry e : entries) {
                Payment.Amount a = new Payment.Amount(e.amountMinor(), e.currency());
                if (e.lessonDate().getYear() < year) {
                    if (e.status() == Payment.Status.PAID && e.paidAt() != null && !e.paidAt().isBefore(opensAt)
                            && e.paidAt().isBefore(closedAt) && YearMonth.from(e.paidAt().atZone(coachZone)).equals(ym)) {
                        paid++;
                        earlier++;
                        g.add(a);
                        eg.add(a);
                    }
                    continue;
                }
                if (!YearMonth.from(e.lessonDate()).equals(ym)) {
                    continue;
                }
                has = true;
                if (e.status() == Payment.Status.PAID && (e.paidAt() == null || e.paidAt().isBefore(closedAt))) {
                    paid++;
                    g.add(a);
                } else if (e.status() == Payment.Status.UNPAID) {
                    u.add(a);
                }
            }
            months.add(new Month(ym, has, paid, Payment.totals(g), Payment.totals(u), earlier, Payment.totals(eg)));
            paidLessons += paid;
            earlierLessons += earlier;
            gross.addAll(g);
            unpaid.addAll(u);
            earlierGross.addAll(eg);
        }
        return new Summary(year, closed, today, months, paidLessons, Payment.totals(gross), Payment.totals(unpaid),
                earlierLessons, Payment.totals(earlierGross));
    }

    /**
     * The summary download: one row per month with the paid lessons and gross received, then the year's totals. No
     * skater names or personal data. Amounts in {@code currency}, as decimals. The last column says how much of each
     * month's gross was paid for lessons in earlier years (owner, 2026-11-13).
     */
    public static String csv(Summary s, String currency) {
        StringBuilder out = new StringBuilder();
        line(out, "Month", "Paid lessons", "Gross received (" + currency + ")", "Of which for lessons in earlier years (" + currency + ")");
        for (Month m : s.months()) {
            String label = m.month().getMonth().getDisplayName(TextStyle.FULL, Locale.US) + " " + s.year();
            if (!s.closed() && m.month().equals(YearMonth.from(s.today()))) {
                label += " (to " + s.today().getMonth().getDisplayName(TextStyle.SHORT, Locale.US) + " " + s.today().getDayOfMonth() + ")";
            }
            line(out, label, String.valueOf(m.paidLessons()), decimal(m.gross().getOrDefault(currency, 0L), currency),
                    decimal(m.earlierGross().getOrDefault(currency, 0L), currency));
        }
        line(out, s.year() + (s.closed() ? " total" : " to date"), String.valueOf(s.paidLessons()),
                decimal(s.gross().getOrDefault(currency, 0L), currency), decimal(s.earlierGross().getOrDefault(currency, 0L), currency));
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
