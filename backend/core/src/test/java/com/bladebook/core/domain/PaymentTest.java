package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatNoException;

/** Paid and waived transitions, how they paid, and totals per currency (ADR-MASTER section 12; R7). */
class PaymentTest {

    private static final PaymentTypes VENMO_AND_CASH = PaymentTypes.of(Set.of(PaymentTypes.Type.VENMO, PaymentTypes.Type.CASH),
            Map.of(PaymentTypes.Type.VENMO, "@dana-skates"));

    @Test
    void aSeatWithNoStatusYetIsUnpaid() {
        assertThat(Payment.of(null)).isEqualTo(Payment.Status.UNPAID);
        assertThat(Payment.of("PAID")).isEqualTo(Payment.Status.PAID);
    }

    @Test
    void unpaidCanBePaidOrWaived() {
        assertThatNoException().isThrownBy(() -> Payment.checkMarkPaid(Payment.Status.UNPAID));
        assertThatNoException().isThrownBy(() -> Payment.checkWaive(Payment.Status.UNPAID));
    }

    @Test
    void aPaidLessonCanChangeHowTheyPaidOrBeUndoneButNotWaived() {
        assertThatNoException().isThrownBy(() -> Payment.checkMarkPaid(Payment.Status.PAID));
        assertThatNoException().isThrownBy(() -> Payment.checkUndo(Payment.Status.PAID));
        assertThatThrownBy(() -> Payment.checkWaive(Payment.Status.PAID)).hasMessage("This lesson is marked paid. Undo that first if it wasn’t paid.");
    }

    @Test
    void waivedIsFinal() {
        assertThatThrownBy(() -> Payment.checkMarkPaid(Payment.Status.WAIVED)).hasMessage("A waived lesson can’t be changed.");
        assertThatThrownBy(() -> Payment.checkUndo(Payment.Status.WAIVED)).hasMessage("A waived lesson can’t be changed.");
        assertThatThrownBy(() -> Payment.checkWaive(Payment.Status.WAIVED)).hasMessage("This lesson is already waived.");
    }

    @Test
    void anUnpaidLessonHasNothingToUndo() {
        assertThatThrownBy(() -> Payment.checkUndo(Payment.Status.UNPAID)).hasMessage("This lesson is already unpaid.");
    }

    @Test
    void howTheyPaidIsATypeTheCoachTakesOrOtherOrNothing() {
        assertThat(Payment.via("VENMO", VENMO_AND_CASH, null)).isEqualTo(Payment.Via.VENMO);
        assertThat(Payment.via("OTHER", VENMO_AND_CASH, null)).isEqualTo(Payment.Via.OTHER);
        assertThat(Payment.via("", VENMO_AND_CASH, null)).isNull();
        assertThat(Payment.via(null, VENMO_AND_CASH, null)).isNull();
        assertThatThrownBy(() -> Payment.via("PAYPAL", VENMO_AND_CASH, null)).hasMessage("Pick how they paid from the list.");
        assertThatThrownBy(() -> Payment.via("BITCOIN", VENMO_AND_CASH, null)).hasMessage("Pick how they paid from the list.");
    }

    @Test
    void aStoredTypeSwitchedOffSinceStaysValid() {
        assertThat(Payment.via("PAYPAL", VENMO_AND_CASH, Payment.Via.PAYPAL)).isEqualTo(Payment.Via.PAYPAL);
    }

    @Test
    void theChoicesAreTheCoachsTypesInOrderThenOther() {
        assertThat(Payment.choices(VENMO_AND_CASH)).containsExactly(Payment.Via.CASH, Payment.Via.VENMO, Payment.Via.OTHER);
        assertThat(Payment.choices(PaymentTypes.none())).containsExactly(Payment.Via.OTHER);
    }

    @Test
    void totalsAreKeptPerCurrencyAndNeverAddedAcross() {
        assertThat(Payment.totals(List.of(new Payment.Amount(5000, "USD"), new Payment.Amount(2251, "USD"), new Payment.Amount(4000, "CAD"))))
                .containsExactly(Map.entry("USD", 7251L), Map.entry("CAD", 4000L));
        assertThat(Payment.totals(List.of())).isEmpty();
    }

    @Test
    void aSharedLessonsOddCentGoesToTheSkaterWhoJoinedFirst() {
        // The amount each seat owes is its share (ADR-MASTER section 12), worked out by PriceShare.
        assertThat(PriceShare.of(4501, 2, List.of("ava", "mia"), "ava")).isEqualTo(2251);
        assertThat(PriceShare.of(4501, 2, List.of("ava", "mia"), "mia")).isEqualTo(2250);
    }
}
