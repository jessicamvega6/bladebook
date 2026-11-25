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
        assertThat(s.earlierGross()).isEmpty();
    }

    @Test
    void aLessonFromAClosedYearPaidLaterCountsInTheMonthItWasPaidMarkedAsForAnEarlierYear() {
        // Owner, 2026-11-13: it counts in the year it was paid, flagged as for a previous year.
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(
                paid("2025-12-31", 4000, "2026-01-01T06:00:00Z"),   // midnight Jan 1 in Chicago: January 2026
                paid("2025-12-15", 3000, "2026-02-05T15:00:00Z"),   // February 2026
                paid("2025-12-20", 2000, "2025-12-21T15:00:00Z"),   // paid before 2025 closed: 2025's, not here
                of("2025-12-22", 1000, Payment.Status.UNPAID),       // last year's unpaid lesson: not this year's
                paid("2026-01-10", 5000, "2026-01-10T15:00:00Z")), CHICAGO, TODAY);
        FinancialSummary.Month jan = s.months().get(0);
        assertThat(jan.paidLessons()).isEqualTo(2);
        assertThat(jan.gross()).containsExactly(Map.entry("USD", 9000L));
        assertThat(jan.earlierLessons()).isEqualTo(1);
        assertThat(jan.earlierGross()).containsExactly(Map.entry("USD", 4000L));
        FinancialSummary.Month feb = s.months().get(1);
        assertThat(feb.hasLessons()).isFalse();
        assertThat(feb.paidLessons()).isEqualTo(1);
        assertThat(feb.earlierGross()).containsExactly(Map.entry("USD", 3000L));
        assertThat(s.paidLessons()).isEqualTo(3);
        assertThat(s.gross()).containsExactly(Map.entry("USD", 12000L));
        assertThat(s.earlierLessons()).isEqualTo(2);
        assertThat(s.earlierGross()).containsExactly(Map.entry("USD", 7000L));
        assertThat(s.unpaid()).isEmpty();
    }

    @Test
    void aLessonFromAClosedYearPaidAfterThisYearAlsoClosedIsNotInThisYear() {
        FinancialSummary.Summary s = FinancialSummary.of(2025, List.of(
                paid("2024-12-15", 3000, "2026-01-05T15:00:00Z")), CHICAGO, TODAY);
        assertThat(s.gross()).isEmpty();
        assertThat(s.earlierGross()).isEmpty();
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
        assertThat(lines[0]).isEqualTo("Month,Paid lessons,Gross received (USD),Paid in 2025 for 2024 lessons (USD),"
                + "Taken off in 2025 for 2024 lessons marked unpaid (USD)");
        assertThat(lines[1]).isEqualTo("January 2025,0,0.00,0.00,0.00");
        assertThat(lines[2]).isEqualTo("February 2025,2,75.01,0.00,0.00");
        assertThat(lines[12]).isEqualTo("December 2025,0,0.00,0.00,0.00");
        assertThat(lines[13]).isEqualTo("2025 total,2,75.01,0.00,0.00");
        assertThat(csv).endsWith("\r\n");
    }

    @Test
    void theCsvShowsWhatWasPaidForEarlierYearsLessons() {
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(
                paid("2025-12-15", 3000, "2026-01-05T15:00:00Z"),
                paid("2026-01-12", 5000, "2026-01-12T15:00:00Z")), CHICAGO, TODAY);
        String[] lines = FinancialSummary.csv(s, "USD").split("\r\n");
        assertThat(lines[1]).isEqualTo("January 2026,2,80.00,30.00,0.00");
        assertThat(lines[12]).isEqualTo("2026 to date,2,80.00,30.00,0.00");
    }

    @Test
    void thisYearsCsvRunsToThisMonth() {
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(), CHICAGO, TODAY);
        String[] lines = FinancialSummary.csv(s, "CAD").split("\r\n");
        assertThat(lines).hasSize(13);
        assertThat(lines[0]).isEqualTo("Month,Paid lessons,Gross received (CAD),Paid in 2026 for 2025 lessons (CAD),"
                + "Taken off in 2026 for 2025 lessons marked unpaid (CAD)");
        assertThat(lines[11]).isEqualTo("November 2026 (to Nov 13),0,0.00,0.00,0.00");
        assertThat(lines[12]).isEqualTo("2026 to date,0,0.00,0.00,0.00");
        assertThat(FinancialSummary.fileName(2026)).isEqualTo("bladebook-summary-2026.csv");
    }

    // ------------------------------------------------------------- Batch 26: closed years saved (G-36)

    private static FinancialSummary.Correction undone(String at, String lessonDate, int minor) {
        return new FinancialSummary.Correction(Instant.parse(at), LocalDate.parse(lessonDate), minor, "USD");
    }

    @Test
    void anUndoOfAClosedYearsPaymentLowersTheMonthItWasUndoneFlaggedAsForAnEarlierYear() {
        // ADR-030 amendment of 2026-11-16: a correction to a closed year's lesson counts in the year it's made.
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(
                paid("2026-03-02", 5000, "2026-03-02T15:00:00Z"),
                paid("2025-12-15", 3000, "2026-03-05T15:00:00Z")),          // a late payment in March
                List.of(undone("2026-03-10T15:00:00Z", "2025-12-08", 4000),  // a 2025 payment undone in March
                        undone("2026-01-01T05:59:59Z", "2025-12-01", 1000),  // still Dec 31 in Chicago: not 2026's
                        undone("2027-01-01T06:00:00Z", "2026-12-01", 1000)), // 2027's
                CHICAGO, TODAY);
        FinancialSummary.Month mar = s.months().get(2);
        assertThat(mar.paidLessons()).isEqualTo(1);                         // two marked paid, one undone (owner, 2026-11-16)
        assertThat(mar.gross()).containsExactly(Map.entry("USD", 4000L));  // 5000 + 3000 - 4000
        assertThat(mar.earlierLessons()).isEqualTo(1);
        assertThat(mar.earlierGross()).containsExactly(Map.entry("USD", 3000L));
        assertThat(mar.undoneLessons()).isEqualTo(1);
        assertThat(mar.undoneGross()).containsExactly(Map.entry("USD", 4000L));
        assertThat(s.months().get(0).undoneLessons()).isZero();
        assertThat(s.gross()).containsExactly(Map.entry("USD", 4000L));
        assertThat(s.undoneLessons()).isEqualTo(1);
        assertThat(s.undoneGross()).containsExactly(Map.entry("USD", 4000L));
        String[] lines = FinancialSummary.csv(s, "USD").split("\r\n");
        // Owner, 2026-11-16: late payments and undone amounts in columns of their own, both positive.
        assertThat(lines[3]).isEqualTo("March 2026,1,40.00,30.00,40.00");
        assertThat(lines[12]).isEqualTo("2026 to date,1,40.00,30.00,40.00");
    }

    @Test
    void anUndoLowersTheMonthsPaidLessonsButNeverBelowZero() {
        // Owner, 2026-11-16: an undo lowers the count too; a month's count never goes below zero, and the year's is the
        // sum of the months'.
        FinancialSummary.Summary s = FinancialSummary.of(2026, List.of(
                paid("2026-03-02", 5000, "2026-03-02T15:00:00Z"),
                paid("2026-03-09", 5000, "2026-03-09T15:00:00Z"),
                paid("2026-04-06", 5000, "2026-04-06T15:00:00Z")),
                List.of(undone("2026-02-10T15:00:00Z", "2025-12-08", 5000),   // February: undos and nothing paid
                        undone("2026-02-11T15:00:00Z", "2025-12-15", 5000),
                        undone("2026-04-10T15:00:00Z", "2025-12-22", 5000)),  // April: one paid, one undone
                CHICAGO, TODAY);
        FinancialSummary.Month feb = s.months().get(1);
        assertThat(feb.paidLessons()).isZero();                              // not -2
        assertThat(feb.undoneLessons()).isEqualTo(2);
        assertThat(feb.gross()).containsExactly(Map.entry("USD", -10000L));
        assertThat(s.months().get(2).paidLessons()).isEqualTo(2);
        assertThat(s.months().get(3).paidLessons()).isZero();
        assertThat(s.paidLessons()).isEqualTo(2);                            // 0 + 2 + 0, not 3 - 3
        String[] lines = FinancialSummary.csv(s, "USD").split("\r\n");
        assertThat(lines[2]).isEqualTo("February 2026,0,-100.00,0.00,100.00");
        assertThat(lines[12]).isEqualTo("2026 to date,2,0.00,0.00,150.00");
    }

    @Test
    void aSavedYearsMonthsReadBackNeverBelowZero() {
        FinancialSummary.Summary live = FinancialSummary.of(2025, List.of(paid("2025-05-05", 5000, "2025-05-05T15:00:00Z")),
                List.of(undone("2025-02-10T15:00:00Z", "2024-12-08", 5000)), CHICAGO, TODAY);
        assertThat(live.months().get(1).paidLessons()).isZero();
        List<FinancialSummary.Month> months = new java.util.ArrayList<>(live.months());
        FinancialSummary.Month feb = months.get(1);
        months.set(1, new FinancialSummary.Month(feb.month(), feb.hasLessons(), -1, feb.gross(), Map.of(), feb.earlierLessons(),
                feb.earlierGross(), feb.undoneLessons(), feb.undoneGross()));   // as only a hand-edited item could hold
        FinancialSummary.Summary saved = FinancialSummary.saved(2025, months, TODAY);
        assertThat(saved.months().get(1).paidLessons()).isZero();
        assertThat(saved.paidLessons()).isEqualTo(1);
        assertThat(FinancialSummary.csv(saved, "USD")).contains("February 2025,0,-50.00,0.00,50.00\r\n")
                .endsWith("2025 total,1,0.00,0.00,50.00\r\n");
    }

    @Test
    void aPaymentCountsInTheLessonsYearOrTheNextWhenPaidLate() {
        assertThat(FinancialSummary.countedIn(LocalDate.parse("2025-12-31"), Instant.parse("2026-01-01T05:59:59Z"), CHICAGO)).hasValue(2025);
        assertThat(FinancialSummary.countedIn(LocalDate.parse("2025-12-31"), Instant.parse("2026-01-01T06:00:00Z"), CHICAGO)).hasValue(2026);
        assertThat(FinancialSummary.countedIn(LocalDate.parse("2025-06-01"), null, CHICAGO)).hasValue(2025);
        // Paid two or more years after the lesson's year: the page never read it, so it counted in no year (G-39).
        assertThat(FinancialSummary.countedIn(LocalDate.parse("2024-12-31"), Instant.parse("2026-02-01T15:00:00Z"), CHICAGO)).isEmpty();
    }

    @Test
    void aSavedYearIsReadBackAsClosedWithItsTotals() {
        FinancialSummary.Summary live = FinancialSummary.of(2025, List.of(
                paid("2025-02-03", 5000, "2025-02-03T15:00:00Z"),
                paid("2024-12-20", 2000, "2025-01-04T15:00:00Z"),
                of("2025-03-03", 5000, Payment.Status.UNPAID)),
                List.of(undone("2025-04-01T15:00:00Z", "2024-11-04", 1500)), CHICAGO, TODAY);
        FinancialSummary.Summary saved = FinancialSummary.saved(2025, live.months(), TODAY);
        assertThat(saved.closed()).isTrue();
        assertThat(saved.months()).hasSize(12);
        assertThat(saved.paidLessons()).isEqualTo(2);
        assertThat(saved.gross()).containsExactly(Map.entry("USD", 5500L));
        assertThat(saved.earlierLessons()).isEqualTo(1);
        assertThat(saved.earlierGross()).containsExactly(Map.entry("USD", 2000L));
        assertThat(saved.undoneLessons()).isEqualTo(1);
        assertThat(saved.undoneGross()).containsExactly(Map.entry("USD", 1500L));
        assertThat(saved.unpaid()).isEmpty();                                // "still unpaid" is this year's only
        assertThat(saved.months().get(2).hasLessons()).isTrue();
        assertThat(saved.months().get(2).unpaid()).isEmpty();
        assertThat(FinancialSummary.csv(saved, "USD")).isEqualTo(FinancialSummary.csv(live, "USD"));
    }

    @Test
    void onlyAFinishedYearsTwelveMonthsCanBeSaved() {
        FinancialSummary.Summary thisYear = FinancialSummary.of(2026, List.of(), CHICAGO, TODAY);
        assertThatThrownBy(() -> FinancialSummary.saved(2026, thisYear.months(), TODAY)).isInstanceOf(IllegalArgumentException.class);
        FinancialSummary.Summary last = FinancialSummary.of(2025, List.of(), CHICAGO, TODAY);
        assertThatThrownBy(() -> FinancialSummary.saved(2025, last.months().subList(0, 11), TODAY))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
