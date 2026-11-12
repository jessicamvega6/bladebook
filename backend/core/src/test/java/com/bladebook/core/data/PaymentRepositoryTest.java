package com.bladebook.core.data;

import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.Payment;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Payment writes are conditional on the status the coach saw (ADR-MASTER section 12). */
class PaymentRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-20T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);

    private DynamoDbLocal.Fixture f;
    private PaymentRepository payments;
    private AccessContext dana;
    private String seatKey;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        payments = new PaymentRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        Skater ava = FamilyTestData.skater("Ava Park");
        ClientContext park = FamilyTestData.register(f, List.of(ava), dana);
        FamilyTestData.approve(f, dana, park, ava);
        LinkedSkater linked = new ClientLinks(f.clients, f.table).requireActive(park, dana.coachId(), ava.studentId());
        FamilyTestData.openTime(f, dana, MONDAY, LocalTime.of(6, 0), 5000, 1);
        BookingRepository bookings = new BookingRepository(f.clients, f.table);
        AvailableTime six = bookings.times(park, linked.coach(), MONDAY, MONDAY).get(0);
        bookings.book(park, linked, six, UUID.randomUUID().toString(), Instant.parse("2026-11-10T15:00:00Z"));
        seatKey = Seat.key(MONDAY, LocalTime.of(6, 0), ava.studentId());
    }

    private PaymentRepository.PaidSeat seat() {
        return payments.seats(dana, MONDAY, MONDAY).get(0);
    }

    @Test
    void aNewSeatIsUnpaid() {
        assertThat(seat().status()).isEqualTo(Payment.Status.UNPAID);
        assertThat(seat().paidVia()).isNull();
    }

    @Test
    void paidWithHowTheyPaidThenChangedThenUndone() {
        assertThat(payments.markPaid(dana, seatKey, Payment.Status.UNPAID, Payment.Via.VENMO, NOW)).isTrue();
        assertThat(seat().status()).isEqualTo(Payment.Status.PAID);
        assertThat(seat().paidVia()).isEqualTo(Payment.Via.VENMO);
        assertThat(payments.markPaid(dana, seatKey, Payment.Status.PAID, null, NOW)).isTrue();
        assertThat(seat().paidVia()).isNull();
        assertThat(payments.undo(dana, seatKey)).isTrue();
        assertThat(seat().status()).isEqualTo(Payment.Status.UNPAID);
    }

    @Test
    void aWriteFromAStaleViewFails() {
        payments.waive(dana, seatKey, NOW);
        assertThat(payments.markPaid(dana, seatKey, Payment.Status.UNPAID, null, NOW)).isFalse();
        assertThat(payments.undo(dana, seatKey)).isFalse();
        assertThat(payments.waive(dana, seatKey, NOW)).isFalse();
        assertThat(seat().status()).isEqualTo(Payment.Status.WAIVED);
    }

    @Test
    void aSeatFromBeforePaymentsWereRecordedCountsAsUnpaid() {
        f.clients.forSetup().updateItem(b -> b.tableName(f.table).key(FamilyItems.key("COACH#" + dana.coachId(), seatKey))
                .updateExpression("REMOVE paymentStatus"));
        assertThat(seat().status()).isEqualTo(Payment.Status.UNPAID);
        assertThat(payments.markPaid(dana, seatKey, Payment.Status.UNPAID, Payment.Via.CASH, NOW)).isTrue();
        assertThat(seat().status()).isEqualTo(Payment.Status.PAID);
    }

    @Test
    void aSeatThatIsGoneCantBePaid() {
        assertThat(payments.markPaid(dana, Seat.key(MONDAY, LocalTime.of(7, 0), "nobody"), Payment.Status.UNPAID, null, NOW)).isFalse();
        assertThat(Map.<String, AttributeValue>of()).isEmpty();
    }
}
