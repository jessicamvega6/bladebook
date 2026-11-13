package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FinancialSummary;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * The coach's financial page and its summary download (ADR-MASTER section 12 "Financial page"; ADR-030 as amended
 * 2026-11-12). Built on the Payments page's rows, so a lesson's amount is the same share Payments shows, and only
 * lessons that have happened count. Gross only: rink fees are Phase 2.
 */
public final class FinancialService {

    /** One year's figures, in the coach's currency on the page; amounts stay per currency underneath. */
    public record Page(FinancialSummary.Summary summary, String currency) {
    }

    /** The summary CSV: no skater names or personal data. */
    public record Download(String fileName, String csv) {
    }

    private final PaymentService payments;
    private final CoachRepository coaches;
    private final Clock clock;

    public FinancialService(PaymentService payments, CoachRepository coaches, Clock clock) {
        this.payments = payments;
        this.coaches = coaches;
        this.clock = clock;
    }

    public Page year(AccessContext ctx, int year) {
        CoachProfile coach = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
        ZoneId zone = ZoneId.of(coach.coachTimezone());
        LocalDate today = LocalDate.ofInstant(clock.instant(), zone);
        FinancialSummary.checkYear(year, today);
        LocalDate from = LocalDate.of(year, 1, 1);
        LocalDate to = LocalDate.of(year, 12, 31);
        List<FinancialSummary.Entry> entries = payments.list(ctx, from, to).rows().stream()
                .map(r -> new FinancialSummary.Entry(r.date(), r.amountMinor(), r.currency(), r.status(), r.paidAt())).toList();
        return new Page(FinancialSummary.of(year, entries, zone, today), coach.currency().name());
    }

    public Download download(AccessContext ctx, int year) {
        Page p = year(ctx, year);
        return new Download(FinancialSummary.fileName(year), FinancialSummary.csv(p.summary(), p.currency()));
    }
}
