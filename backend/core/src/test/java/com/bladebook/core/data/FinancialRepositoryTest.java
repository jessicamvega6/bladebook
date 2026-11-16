package com.bladebook.core.data;

import com.bladebook.core.domain.FinancialSummary;
import com.bladebook.core.domain.Payment;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** A closed year's saved figures and the corrections to closed years (Batch 26; ADR-030 decision 4, amended 2026-11-16). */
class FinancialRepositoryTest {

    private static final ZoneId CHICAGO = ZoneId.of("America/Chicago");
    private static final LocalDate TODAY = LocalDate.of(2026, 1, 2);

    private DynamoDbLocal.Fixture f;
    private FinancialRepository repo;
    private AccessContext dana;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        repo = new FinancialRepository(f.clients, f.table);
        dana = new AccessContext(UUID.randomUUID().toString());
    }

    private static List<FinancialSummary.Month> months(int grossMinor) {
        return FinancialSummary.of(2025, List.of(
                new FinancialSummary.Entry(LocalDate.of(2025, 3, 3), grossMinor, "USD", Payment.Status.PAID, Instant.parse("2025-03-03T15:00:00Z")),
                new FinancialSummary.Entry(LocalDate.of(2025, 4, 7), 6000, "CAD", Payment.Status.PAID, Instant.parse("2025-04-07T15:00:00Z")),
                new FinancialSummary.Entry(LocalDate.of(2024, 12, 9), 2000, "USD", Payment.Status.PAID, Instant.parse("2025-01-04T15:00:00Z"))),
                List.of(new FinancialSummary.Correction(Instant.parse("2025-05-05T15:00:00Z"), LocalDate.of(2024, 11, 4), 1500, "USD")),
                CHICAGO, TODAY).months();
    }

    @Test
    void aClosedYearIsSavedOnceAndReadBackAsItWas() {
        assertThat(repo.savedYear(dana, 2025)).isEmpty();
        Instant at = Instant.parse("2026-01-01T14:00:00Z");
        assertThat(repo.saveYear(dana, new FinancialRepository.SavedYear(2025, months(5000), at, FinancialRepository.SavedBy.JOB))).isTrue();

        FinancialRepository.SavedYear back = repo.savedYear(dana, 2025).orElseThrow();
        assertThat(back.year()).isEqualTo(2025);
        assertThat(back.savedAt()).isEqualTo(at);
        assertThat(back.savedBy()).isEqualTo(FinancialRepository.SavedBy.JOB);
        assertThat(back.months()).isEqualTo(months(5000));
        FinancialSummary.Month mar = back.months().get(2);
        assertThat(mar.hasLessons()).isTrue();
        assertThat(mar.gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(back.months().get(3).gross()).containsExactly(Map.entry("CAD", 6000L));
        assertThat(back.months().get(0).earlierGross()).containsExactly(Map.entry("USD", 2000L));
        assertThat(back.months().get(4).undoneGross()).containsExactly(Map.entry("USD", 1500L));
        assertThat(back.months().get(4).gross()).containsExactly(Map.entry("USD", -1500L));
    }

    @Test
    void aSecondSaveDoesntOverwriteTheFirst() {
        repo.saveYear(dana, new FinancialRepository.SavedYear(2025, months(5000), Instant.parse("2026-01-01T14:00:00Z"),
                FinancialRepository.SavedBy.READ));
        assertThat(repo.saveYear(dana, new FinancialRepository.SavedYear(2025, months(9900), Instant.parse("2026-01-02T14:00:00Z"),
                FinancialRepository.SavedBy.JOB))).isFalse();
        FinancialRepository.SavedYear back = repo.savedYear(dana, 2025).orElseThrow();
        assertThat(back.months().get(2).gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(back.savedBy()).isEqualTo(FinancialRepository.SavedBy.READ);
    }

    @Test
    void eachCoachHasTheirOwnYear() {
        repo.saveYear(dana, new FinancialRepository.SavedYear(2025, months(5000), Instant.parse("2026-01-01T14:00:00Z"),
                FinancialRepository.SavedBy.JOB));
        assertThat(repo.savedYear(new AccessContext(UUID.randomUUID().toString()), 2025)).isEmpty();
        assertThat(repo.savedYear(dana, 2024)).isEmpty();
    }

    @Test
    void correctionsAreReadByWhenTheyWereMadeWithADaysMarginEachSide() {
        FinancialRepository.Undone a = undone("2026-01-01T05:00:00Z", "SEAT#2025-12-01#06:00#s1");   // Dec 31 in Chicago
        FinancialRepository.Undone b = undone("2026-03-10T15:00:00.123Z", "SEAT#2025-12-08#06:00#s1");
        FinancialRepository.Undone c = undone("2027-02-10T15:00:00Z", "SEAT#2026-12-08#06:00#s1");
        for (FinancialRepository.Undone u : List.of(a, b, c)) {
            f.clients.forSetup().putItem(p -> p.tableName(f.table).item(FinancialRepository.correctionItem(dana, u)));
        }
        List<FinancialSummary.Correction> got = repo.corrections(dana, Instant.parse("2026-01-01T06:00:00Z"),
                Instant.parse("2027-01-01T06:00:00Z"));
        // The query keeps a day either side, so the year's own edge is left to FinancialSummary.
        assertThat(got).extracting(FinancialSummary.Correction::at)
                .containsExactly(Instant.parse("2026-01-01T05:00:00Z"), Instant.parse("2026-03-10T15:00:00.123Z"));
        assertThat(got.get(1).lessonDate()).isEqualTo(LocalDate.of(2025, 12, 8));
        assertThat(got.get(1).amountMinor()).isEqualTo(4000);
        assertThat(got.get(1).currency()).isEqualTo("USD");
    }

    private static FinancialRepository.Undone undone(String at, String seatKey) {
        String[] k = seatKey.split("#");
        return new FinancialRepository.Undone(Instant.parse(at), seatKey, LocalDate.parse(k[1]), LocalTime.parse(k[2]), k[3], 4000, "USD", 2025);
    }
}
