package com.bladebook.api.coach.dto;

import com.bladebook.core.service.PaymentService;

import java.util.List;
import java.util.Map;

/** The Payments page (Batch 8). Amounts are minor units, each with its currency; totals are per currency. */
public final class PaymentDtos {

    private PaymentDtos() {
    }

    /** {@code status}: UNPAID, PAID or WAIVED; {@code paidVia}: CASH, CASHAPP, VENMO, PAYPAL, OTHER or null. */
    public record RowDto(String date, String startTime, int durationMinutes, String studentId, String fullName, String familyName,
                         String relationship, String attendance, int amountMinor, String currency, String status, String paidVia,
                         List<String> sharedWith) {
        public static RowDto of(PaymentService.Row r) {
            return new RowDto(r.date().toString(), r.startTime().toString(), r.durationMinutes(), r.studentId(), r.fullName(), r.familyName(),
                    r.relationship() == null ? null : r.relationship().name(), r.attendance().name(), r.amountMinor(), r.currency(),
                    r.status().name(), r.paidVia() == null ? null : r.paidVia().name(), r.sharedWith());
        }
    }

    public record TotalsDto(Map<String, Long> unpaid, int unpaidCount, Map<String, Long> paid, int paidCount, int noShows,
                            Map<String, Long> noShowsUnpaid, int notRecorded) {
    }

    public record ViewDto(List<RowDto> rows, TotalsDto totals, List<String> choices, String currency) {
        public static ViewDto of(PaymentService.View v) {
            PaymentService.Totals t = v.totals();
            return new ViewDto(v.rows().stream().map(RowDto::of).toList(),
                    new TotalsDto(t.unpaid(), t.unpaidCount(), t.paid(), t.paidCount(), t.noShows(), t.noShowsUnpaid(), t.notRecorded()),
                    v.choices().stream().map(Enum::name).toList(), v.currency());
        }
    }

    /** One skater's lesson; {@code paidVia} only when marking paid. */
    public record SeatBody(String date, String startTime, String studentId, String paidVia) {
    }
}
