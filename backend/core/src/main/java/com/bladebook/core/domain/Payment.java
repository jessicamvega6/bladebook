package com.bladebook.core.domain;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Payment, per seat (ADR-MASTER section 12; ADR-003). BladeBook never moves money: the coach records that it arrived.
 * {@code UNPAID} → {@code PAID} (mark paid, optionally with how they paid) or {@code WAIVED} (mark waived). Waived is
 * final (R7, owner 2026-11-09); only a paid lesson goes back to unpaid. Only the coach sets any of it.
 */
public final class Payment {

    public enum Status { UNPAID, PAID, WAIVED }

    /** {@code paidVia}: one of the payment types the coach takes, or {@code OTHER}. */
    public enum Via { CASH, CASHAPP, VENMO, PAYPAL, OTHER }

    static final String WAIVED_FINAL = "A waived lesson can’t be changed.";
    static final String ALREADY = "This lesson is already %s.";

    private Payment() {
    }

    /** A seat written before Batch 8 has no {@code paymentStatus}: it is unpaid. */
    public static Status of(String stored) {
        return stored == null ? Status.UNPAID : Status.valueOf(stored);
    }

    /**
     * A lesson dated before January 1 of last year is view only (G-39; owner, 2026-11-15): it can't be marked paid, have
     * how they paid changed or be undone, because the financial page reads only this year's and last year's lessons, so
     * a payment for it would count in no year. {@code today} is the date in the coach's time zone. Waiving it is still
     * allowed (owner, 2026-11-16), so an old unpaid lesson can be settled; a waive never touches the figures.
     */
    public static boolean viewOnly(LocalDate lessonDate, LocalDate today) {
        return lessonDate.isBefore(firstEditable(today));
    }

    /** Refuses a change to a {@linkplain #viewOnly view-only} lesson. */
    public static void checkChangeable(LocalDate lessonDate, LocalDate today) {
        if (viewOnly(lessonDate, today)) {
            throw DomainException.conflict("Lessons from before "
                    + firstEditable(today).format(DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.US))
                    + " can be viewed but not changed.");
        }
    }

    private static LocalDate firstEditable(LocalDate today) {
        return LocalDate.of(today.getYear() - 1, 1, 1);
    }

    /** Mark paid: from unpaid, or on a paid lesson to change how they paid. */
    public static void checkMarkPaid(Status now) {
        if (now == Status.WAIVED) {
            throw DomainException.conflict(WAIVED_FINAL);
        }
    }

    /** Waive: only an unpaid lesson. It can't be undone. */
    public static void checkWaive(Status now) {
        if (now == Status.WAIVED) {
            throw DomainException.conflict(String.format(ALREADY, "waived"));
        }
        if (now == Status.PAID) {
            throw DomainException.conflict("This lesson is marked paid. Undo that first if it wasn’t paid.");
        }
    }

    /** Undo: only a paid lesson goes back to unpaid. */
    public static void checkUndo(Status now) {
        if (now == Status.WAIVED) {
            throw DomainException.conflict(WAIVED_FINAL);
        }
        if (now == Status.UNPAID) {
            throw DomainException.conflict(String.format(ALREADY, "unpaid"));
        }
    }

    /**
     * How they paid: blank for none; otherwise a type the coach takes, or {@code OTHER}. A stored value whose type was
     * switched off since stays valid, so editing never loses it.
     */
    public static Via via(String value, PaymentTypes coachTakes, Via stored) {
        if (value == null || value.isBlank()) {
            return null;
        }
        Via v;
        try {
            v = Via.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw DomainException.invalid("paidVia", "Pick how they paid from the list.");
        }
        if (v == Via.OTHER || v == stored || coachTakes.isOn(PaymentTypes.Type.valueOf(v.name()))) {
            return v;
        }
        throw DomainException.invalid("paidVia", "Pick how they paid from the list.");
    }

    /** Amounts in minor units, summed per currency: never a total across currencies. */
    public static Map<String, Long> totals(List<Amount> amounts) {
        Map<String, Long> out = new LinkedHashMap<>();
        for (Amount a : amounts) {
            out.merge(a.currency(), (long) a.minor(), Long::sum);
        }
        return out;
    }

    public record Amount(int minor, String currency) {
    }

    /** The choices on the Mark paid dialog: the types the coach takes, in profile order, then Other. */
    public static List<Via> choices(PaymentTypes coachTakes) {
        List<Via> out = new ArrayList<>();
        for (PaymentTypes.Type t : PaymentTypes.Type.values()) {
            if (coachTakes.isOn(t)) {
                out.add(Via.valueOf(t.name()));
            }
        }
        out.add(Via.OTHER);
        return out;
    }
}
