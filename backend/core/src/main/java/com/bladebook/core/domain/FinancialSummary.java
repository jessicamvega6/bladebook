package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Currency;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.OptionalInt;

/**
 * The coach's financial page and its summary download (ADR-MASTER section 12 "Financial page"; ADR-030 as amended
 * 2026-11-12). Gross is money received: seats marked paid, at their share, which in MVP includes a no-show marked paid
 * (the missed-lesson fee collected). Waived and unpaid are left out. A lesson counts in the year and month of its
 * lesson date. Rink fees are Phase 2.
 *
 * <p>A finished year is closed: it closes at midnight starting January 1 in the coach's time zone, and nothing paid
 * after that changes it. A lesson from a closed year marked paid later counts in the year and month it was marked
 * paid, flagged as for an earlier year ({@code earlierLessons}, {@code earlierGross}; owner, 2026-11-13).
 *
 * <p>Since Batch 26 (ADR-030 decision 4, amended 2026-11-16) a closed year's figures are saved once ({@link #saved}),
 * and a payment undone after the year it counted in has closed is a correction ({@link Correction}): it takes its
 * amount off the month it was undone, flagged as for an earlier year ({@code undoneLessons}, {@code undoneGross}).
 */
public final class FinancialSummary {

    /** One skater's lesson that has happened. {@code paidAt} only when paid. */
    public record Entry(LocalDate lessonDate, int amountMinor, String currency, Payment.Status status, Instant paidAt) {
    }

    /**
     * A payment undone after the year it counted in had closed (Batch 26): {@code at} is when it was undone, which puts
     * it in that year and month; {@code lessonDate} is the lesson's. The amount is what the payment had counted.
     */
    public record Correction(Instant at, LocalDate lessonDate, int amountMinor, String currency) {
    }

    /**
     * One month. {@code hasLessons}: any of its own lessons that happened, paid or not. {@code paidLessons} and
     * {@code gross} include the earlier years' lessons paid this month, which {@code earlierLessons} and
     * {@code earlierGross} count again on their own. {@code gross} is net of {@code undoneGross}, the earlier years'
     * payments undone this month; {@code paidLessons} counts lessons marked paid and isn't lowered by an undo. Amounts
     * per currency, never added across.
     */
    public record Month(YearMonth month, boolean hasLessons, int paidLessons, Map<String, Long> gross, Map<String, Long> unpaid,
                        int earlierLessons, Map<String, Long> earlierGross, int undoneLessons, Map<String, Long> undoneGross) {

        public Month {
            gross = Map.copyOf(gross);
            unpaid = Map.copyOf(unpaid);
            earlierGross = Map.copyOf(earlierGross);
            undoneGross = Map.copyOf(undoneGross);
        }
    }

    /** A year: January to this month (this year) or to December (a closed year). */
    public record Summary(int year, boolean closed, LocalDate today, List<Month> months, int paidLessons, Map<String, Long> gross,
                          Map<String, Long> unpaid, int earlierLessons, Map<String, Long> earlierGross, int undoneLessons,
                          Map<String, Long> undoneGross) {

        public Summary {
            months = List.copyOf(months);
            gross = Map.copyOf(gross);
            unpaid = Map.copyOf(unpaid);
            earlierGross = Map.copyOf(earlierGross);
            undoneGross = Map.copyOf(undoneGross);
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

    /** Midnight starting January 1 of {@code year + 1} in the coach's time zone: when {@code year} closes. */
    public static Instant closesAt(int year, ZoneId coachZone) {
        return LocalDate.of(year + 1, 1, 1).atStartOfDay(coachZone).toInstant();
    }

    /**
     * The year a payment counted in: its lesson's year when paid before that year closed (or with no {@code paidAt},
     * as written before Batch 8), the next year when paid during it; none when paid later still, since the page reads
     * only this year's and last year's lessons (G-39, Batch 27).
     */
    public static OptionalInt countedIn(LocalDate lessonDate, Instant paidAt, ZoneId coachZone) {
        int year = lessonDate.getYear();
        if (paidAt == null || paidAt.isBefore(closesAt(year, coachZone))) {
            return OptionalInt.of(year);
        }
        return paidAt.isBefore(closesAt(year + 1, coachZone)) ? OptionalInt.of(year + 1) : OptionalInt.empty();
    }

    /** {@link #of(int, List, List, ZoneId, LocalDate)} with no corrections. */
    public static Summary of(int year, List<Entry> entries, ZoneId coachZone, LocalDate today) {
        return of(year, entries, List.of(), coachZone, today);
    }

    /**
     * {@code entries}: the year's own lessons, and any earlier year's lessons that might have been paid during it
     * (they count only if marked paid between this year's start and its close). {@code corrections}: any undone
     * payments that might have been undone during it (they count only if undone between this year's start and close).
     */
    public static Summary of(int year, List<Entry> entries, List<Correction> corrections, ZoneId coachZone, LocalDate today) {
        boolean closed = year < today.getYear();
        Instant opensAt = closesAt(year - 1, coachZone);
        Instant closedAt = closesAt(year, coachZone);
        int last = closed ? 12 : today.getMonthValue();
        List<Month> months = new ArrayList<>();
        for (int m = 1; m <= last; m++) {
            YearMonth ym = YearMonth.of(year, m);
            boolean has = false;
            int paid = 0;
            int earlier = 0;
            int undone = 0;
            List<Payment.Amount> g = new ArrayList<>();
            List<Payment.Amount> u = new ArrayList<>();
            List<Payment.Amount> eg = new ArrayList<>();
            List<Payment.Amount> ug = new ArrayList<>();
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
            for (Correction c : corrections) {
                if (!c.at().isBefore(opensAt) && c.at().isBefore(closedAt) && YearMonth.from(c.at().atZone(coachZone)).equals(ym)) {
                    undone++;
                    g.add(new Payment.Amount(-c.amountMinor(), c.currency()));
                    ug.add(new Payment.Amount(c.amountMinor(), c.currency()));
                }
            }
            months.add(new Month(ym, has, paid, Payment.totals(g), Payment.totals(u), earlier, Payment.totals(eg), undone,
                    Payment.totals(ug)));
        }
        return totals(year, closed, today, months, true);
    }

    /**
     * A closed year as saved when it closed (Batch 26): its twelve months, read back with the year's totals added up.
     * "Still unpaid" is this year's figure only, so a saved year has none.
     */
    public static Summary saved(int year, List<Month> months, LocalDate today) {
        if (year >= today.getYear()) {
            throw new IllegalArgumentException("Only a finished year is saved: " + year);
        }
        if (months.size() != 12) {
            throw new IllegalArgumentException("A saved year has twelve months, not " + months.size());
        }
        List<Month> out = new ArrayList<>();
        for (Month m : months) {
            out.add(new Month(m.month(), m.hasLessons(), m.paidLessons(), m.gross(), Map.of(), m.earlierLessons(), m.earlierGross(),
                    m.undoneLessons(), m.undoneGross()));
        }
        return totals(year, true, today, out, false);
    }

    private static Summary totals(int year, boolean closed, LocalDate today, List<Month> months, boolean withUnpaid) {
        int paidLessons = 0;
        int earlierLessons = 0;
        int undoneLessons = 0;
        Map<String, Long> gross = new HashMap<>();
        Map<String, Long> unpaid = new HashMap<>();
        Map<String, Long> earlierGross = new HashMap<>();
        Map<String, Long> undoneGross = new HashMap<>();
        for (Month m : months) {
            paidLessons += m.paidLessons();
            earlierLessons += m.earlierLessons();
            undoneLessons += m.undoneLessons();
            m.gross().forEach((c, v) -> gross.merge(c, v, Long::sum));
            if (withUnpaid) {
                m.unpaid().forEach((c, v) -> unpaid.merge(c, v, Long::sum));
            }
            m.earlierGross().forEach((c, v) -> earlierGross.merge(c, v, Long::sum));
            m.undoneGross().forEach((c, v) -> undoneGross.merge(c, v, Long::sum));
        }
        return new Summary(year, closed, today, months, paidLessons, gross, unpaid, earlierLessons, earlierGross, undoneLessons,
                undoneGross);
    }

    /**
     * The summary download: one row per month with the paid lessons and gross received, then the year's totals. No
     * skater names or personal data. Amounts in {@code currency}, as decimals. The last column says how much of each
     * month's gross was for lessons in earlier years (owner, 2026-11-13): paid for them, less any of their payments
     * undone (Batch 26), so it can be negative.
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
                    decimal(m.earlierGross().getOrDefault(currency, 0L) - m.undoneGross().getOrDefault(currency, 0L), currency));
        }
        line(out, s.year() + (s.closed() ? " total" : " to date"), String.valueOf(s.paidLessons()),
                decimal(s.gross().getOrDefault(currency, 0L), currency),
                decimal(s.earlierGross().getOrDefault(currency, 0L) - s.undoneGross().getOrDefault(currency, 0L), currency));
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
