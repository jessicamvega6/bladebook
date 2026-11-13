package com.bladebook.core.domain;

import com.bladebook.core.domain.FinancialSummary.Entry;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The financial page (ADR-MASTER section 12 "Financial page"; ADR-030; FeatureDecriptions/Coach Financial Page.md). */
class FinancialSummaryTest {

    private static final ZoneId CHICAGO = ZoneId.of("America/Chicago");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 13);

    private static Entry paid(String date, int minor, String paidAt) {
        return new Entry(LocalDate.parse(date), minor, "USD", Payment.Status.PAID, Instant.parse(paidAt));
    }

    private static Entry of(String date, int minor, Payment.Status status) {
        return new Entry(LocalDate.parse(date), minor, "USD", status, null);
    }

    @Test
    void grossIsPaidLessonsByLessonMonthLeavingOutUnpaidAndWaived() {
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(
                paid("2026-09-07", 5000, "2026-09-07T15:00:00Z"),
                paid("2026-09-30", 2500, "2026-10-02T15:00:00Z"),   // paid in October, counts in September
                of("2026-10-05", 5000, Payment.Status.UNPAID),
                of("2026-10-06", 5000, Payment.Status.WAIVED),
                paid("2026-10-12", 5000, "2026-10-12T15:00:00Z")), CHICAGO, TODAY);

        assertThat(s.closed()).isFalse();
        assertThat(s.months()).hasSize(11);
        assertThat(s.months().get(0).month()).isEqualTo(YearMonth.of(2026, 1));
        assertThat(s.months().get(10).month()).isEqualTo(YearMonth.of(2026, 11));
        FinancialSummary.Month sep = s.months().get(8);
        assertThat(sep.paidLessons()).isEqualTo(2);
        assertThat(sep.gross()).containsExactly(Map.entry("USD", 7500L));
        assertThat(sep.hasLessons()).isTrue();
        FinancialSummary.Month oct = s.months().get(9);
        assertThat(oct.paidLessons()).isEqualTo(1);
        assertThat(oct.gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(oct.unpaid()).containsExactly(Map.entry("USD", 5000L));
        assertThat(s.months().get(7).hasLessons()).isFalse();
        assertThat(s.months().get(7).gross()).isEmpty();
        assertThat(s.paidLessons()).isEqualTo(3);
        assertThat(s.gross()).containsExactly(Map.entry("USD", 12500L));
        assertThat(s.unpaid()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void aWaivedLessonStillMarksTheMonthAsHavingLessons() {
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(of("2026-03-02", 5000, Payment.Status.WAIVED)), CHICAGO, TODAY);
        assertThat(s.months().get(2).hasLessons()).isTrue();
        assertThat(s.gross()).isEmpty();
        assertThat(s.unpaid()).isEmpty();
    }

    @Test
    void aFinishedYearIsClosedAtMidnightInTheCoachsTimeZone() {
        FinancialSummary.Summary s = FinancialSummary.of(2025, List.of(
                paid("2025-12-31", 5000, "2026-01-01T05:59:59Z"),   // 11:59:59 PM on Dec 31 in Chicago: counts
                paid("2025-12-31", 4000, "2026-01-01T06:00:00Z"),   // midnight Jan 1 in Chicago: the year has closed
                paid("2025-12-15", 3000, "2026-01-05T15:00:00Z")), CHICAGO, TODAY);
        assertThat(s.closed()).isTrue();
        assertThat(s.months()).hasSize(12);
        assertThat(s.months().get(11).paidLessons()).isEqualTo(1);
        assertThat(s.gross()).containsExactly(Map.entry("USD", 5000L));
        // A lesson from the closed year counts in no year: it isn't in 2026 either.
        assertThat(FinancialSummary.of(2026, List.of(paid("2025-12-15", 3000, "2026-01-05T15:00:00Z")), CHICAGO, TODAY).gross()).isEmpty();
    }

    @Test
    void aMonthWithOnlyUnpaidLessonsHasLessons() {
        FinancialSummary.Summary s = FinancialSummary.of(2025, List.of(of("2025-06-02", 5000, Payment.Status.UNPAID)), CHICAGO, TODAY);
        assertThat(s.months().get(5).hasLessons()).isTrue();
        assertThat(s.unpaid()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void currenciesAreNeverAddedTogether() {
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(
                paid("2026-02-02", 5000, "2026-02-02T15:00:00Z"),
                new Entry(LocalDate.parse("2026-02-03"), 6000, "CAD", Payment.Status.PAID, Instant.parse("2026-02-03T15:00:00Z"))),
                CHICAGO, TODAY);
        assertThat(s.gross()).containsOnly(Map.entry("USD", 5000L), Map.entry("CAD", 6000L));
        assertThat(s.months().get(1).paidLessons()).isEqualTo(2);
    }

    @Test
    void onlyThisYearOrLastCanBeAskedFor() {
        FinancialSummary.checkYear(2026, TODAY);
        FinancialSummary.checkYear(2025, TODAY);
        assertThatThrownBy(() -> FinancialSummary.checkYear(2024, TODAY)).hasMessage("Pick this year or last year.");
        assertThatThrownBy(() -> FinancialSummary.checkYear(2027, TODAY)).hasMessage("Pick this year or last year.");
    }

    @Test
    void theCsvHasOneRowPerMonthAndTheYearsTotalsWithNoNames() {
        FinancialSummary.Summary s = FinancialSummary.of(2025, List.of(
                paid("2025-02-03", 5000, "2025-02-03T15:00:00Z"),
                paid("2025-02-10", 2501, "2025-02-10T15:00:00Z")), CHICAGO, TODAY);
        String csv = FinancialSummary.csv(s, "USD");
        String[] lines = csv.split("\r\n");
        assertThat(lines).hasSize(14);
        assertThat(lines[0]).isEqualTo("Month,Paid lessons,Gross received (USD)");
        assertThat(lines[1]).isEqualTo("January 2025,0,0.00");
        assertThat(lines[2]).isEqualTo("February 2025,2,75.01");
        assertThat(lines[12]).isEqualTo("December 2025,0,0.00");
        assertThat(lines[13]).isEqualTo("2025 total,2,75.01");
        assertThat(csv).endsWith("\r\n");
    }

    @Test
    void thisYearsCsvRunsToThisMonth() {
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(), CHICAGO, TODAY);
        String[] lines = FinancialSummary.csv(s, "CAD").split("\r\n");
        assertThat(lines).hasSize(13);
        assertThat(lines[0]).isEqualTo("Month,Paid lessons,Gross received (CAD)");
        assertThat(lines[11]).isEqualTo("November 2026 (to Nov 13),0,0.00");
        assertThat(lines[12]).isEqualTo("2026 to date,0,0.00");
        assertThat(FinancialSummary.fileName(2026)).isEqualTo("bladebook-summary-2026.csv");
    }
}
