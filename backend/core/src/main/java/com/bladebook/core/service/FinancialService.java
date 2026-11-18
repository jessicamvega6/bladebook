package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.FinancialRepository;
import com.bladebook.core.data.FinancialRepository.SavedBy;
import com.bladebook.core.data.FinancialRepository.SavedYear;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FinancialSummary;
import com.bladebook.core.domain.Payment;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * The coach's financial page and its summary download (ADR-MASTER section 12 "Financial page"; ADR-030 as amended
 * 2026-11-12). Built on the Payments page's rows, so a lesson's amount is the same share Payments shows, and only
 * lessons that have happened count. Gross only: rink fees are Phase 2.
 *
 * <p>This year is added up from the seats on every read. A closed year is read from its saved figures (Batch 26;
 * ADR-030 decision 4, amended 2026-11-16): saved once, by the January job ({@link ClosedYearJob}), by the first read
 * of the year, or by the first undo of one of its payments, whichever comes first, and never changed after.
 */
public final class FinancialService {

    /** One year's figures, in the coach's currency on the page; amounts stay per currency underneath. */
    public record Page(FinancialSummary.Summary summary, String currency) {
    }

    /** The summary CSV: no skater names or personal data. */
    public record Download(String fileName, String csv) {
    }

    /** What saving a closed year did. */
    public enum Saved { SAVED, ALREADY_SAVED, NOT_CLOSED_YET }

    private final PaymentService payments;
    private final CoachRepository coaches;
    private final FinancialRepository figures;
    private final Clock clock;

    public FinancialService(PaymentService payments, CoachRepository coaches, FinancialRepository figures, Clock clock) {
        this.payments = payments;
        this.coaches = coaches;
        this.figures = figures;
        this.clock = clock;
        payments.closedYears((ctx, year) -> closed(ctx, zone(coach(ctx)), year, SavedBy.UNDO));
    }

    public Page year(AccessContext ctx, int year) {
        CoachProfile coach = coach(ctx);
        ZoneId zone = zone(coach);
        LocalDate today = LocalDate.ofInstant(clock.instant(), zone);
        FinancialSummary.checkYear(year, today);
        FinancialSummary.Summary s = year < today.getYear()
                ? FinancialSummary.saved(year, closed(ctx, zone, year, SavedBy.READ).months(), today)
                : live(ctx, zone, year, today);
        return new Page(s, coach.currency().name());
    }

    public Download download(AccessContext ctx, int year) {
        Page p = year(ctx, year);
        return new Download(FinancialSummary.fileName(year), FinancialSummary.csv(p.summary(), p.currency()));
    }

    /**
     * The January job's step for one coach: saves {@code year}'s figures if the year has closed in the coach's time zone
     * and nothing has saved them yet.
     */
    public Saved saveClosedYear(AccessContext ctx, int year) {
        ZoneId zone = zone(coach(ctx));
        if (clock.instant().isBefore(FinancialSummary.closesAt(year, zone))) {
            return Saved.NOT_CLOSED_YET;
        }
        if (figures.savedYear(ctx, year).isPresent()) {
            return Saved.ALREADY_SAVED;
        }
        return save(ctx, zone, year, SavedBy.JOB) ? Saved.SAVED : Saved.ALREADY_SAVED;
    }

    /** A closed year's saved figures, saving them first if nothing has. */
    private SavedYear closed(AccessContext ctx, ZoneId zone, int year, SavedBy by) {
        return figures.savedYear(ctx, year).orElseGet(() -> {
            save(ctx, zone, year, by);
            return figures.savedYear(ctx, year).orElseThrow();
        });
    }

    /** Adds the closed year up from the seats and saves it unless it's there already. False: it was. */
    private boolean save(AccessContext ctx, ZoneId zone, int year, SavedBy by) {
        Instant now = clock.instant();
        FinancialSummary.Summary s = live(ctx, zone, year, LocalDate.ofInstant(now, zone));
        return figures.saveYear(ctx, new SavedYear(year, s.months(), now, by));
    }

    /**
     * The year added up from the seats: its own lessons, and last year's paid ones, any of which may have been marked
     * paid during it (owner, 2026-11-13; lessons from further back aren't read, G-39); and the corrections made during
     * it to closed years' payments.
     */
    private FinancialSummary.Summary live(AccessContext ctx, ZoneId zone, int year, LocalDate today) {
        List<FinancialSummary.Entry> entries = new ArrayList<>(entries(ctx, year));
        entries.addAll(entries(ctx, year - 1).stream().filter(e -> e.status() == Payment.Status.PAID).toList());
        List<FinancialSummary.Correction> corrections = figures.corrections(ctx, FinancialSummary.closesAt(year - 1, zone),
                FinancialSummary.closesAt(year, zone));
        return FinancialSummary.of(year, entries, corrections, zone, today);
    }

    private List<FinancialSummary.Entry> entries(AccessContext ctx, int year) {
        return payments.buildList(ctx, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31)).rows().stream()
                .map(r -> new FinancialSummary.Entry(r.date(), r.amountMinor(), r.currency(), r.status(), r.paidAt())).toList();
    }

    private CoachProfile coach(AccessContext ctx) {
        return coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
    }

    private static ZoneId zone(CoachProfile coach) {
        return ZoneId.of(coach.coachTimezone());
    }
}
