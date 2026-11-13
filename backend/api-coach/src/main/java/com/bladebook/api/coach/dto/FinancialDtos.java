package com.bladebook.api.coach.dto;

import com.bladebook.core.domain.FinancialSummary;
import com.bladebook.core.service.FinancialService;

import java.util.List;
import java.util.Map;

/** The financial page (Batch 12). Amounts are minor units per currency; the page shows {@code currency}. Gross only. */
public final class FinancialDtos {

    private FinancialDtos() {
    }

    /** {@code month}: yyyy-MM. {@code earlierGross}: the part of {@code gross} paid for lessons in earlier years. */
    public record MonthDto(String month, boolean hasLessons, int paidLessons, Map<String, Long> gross, Map<String, Long> unpaid,
                           int earlierLessons, Map<String, Long> earlierGross) {
        static MonthDto of(FinancialSummary.Month m) {
            return new MonthDto(m.month().toString(), m.hasLessons(), m.paidLessons(), m.gross(), m.unpaid(), m.earlierLessons(),
                    m.earlierGross());
        }
    }

    /** {@code today}: the coach's date, so the page can say "to Nov 13". */
    public record YearDto(int year, boolean closed, String today, List<MonthDto> months, int paidLessons, Map<String, Long> gross,
                          Map<String, Long> unpaid, int earlierLessons, Map<String, Long> earlierGross, String currency) {
        public static YearDto of(FinancialService.Page p) {
            FinancialSummary.Summary s = p.summary();
            return new YearDto(s.year(), s.closed(), s.today().toString(), s.months().stream().map(MonthDto::of).toList(),
                    s.paidLessons(), s.gross(), s.unpaid(), s.earlierLessons(), s.earlierGross(), p.currency());
        }
    }

    /** The summary CSV, saved by the browser under {@code fileName}. */
    public record DownloadDto(String fileName, String csv) {
        public static DownloadDto of(FinancialService.Download d) {
            return new DownloadDto(d.fileName(), d.csv());
        }
    }
}
