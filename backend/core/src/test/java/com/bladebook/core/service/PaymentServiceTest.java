package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.Attendance;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.Payment;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The Payments page (ADR-MASTER section 12; R7). */
class PaymentServiceTest {

    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);
    private static final LocalTime SIX_30 = LocalTime.of(6, 30);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private PaymentService service;
    private AttendanceService attendance;
    private AccessContext dana;
    private String ava;
    private String jack;

    @BeforeEach
    void setUp() {
        FamilyTestSupport t = new FamilyTestSupport();
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        ScheduleRepository repo = new ScheduleRepository(t.f.clients, t.f.table);
        service = new PaymentService(new PaymentRepository(t.f.clients, t.f.table), repo, t.studentRepo, t.coaches, clock);
        attendance = new AttendanceService(new AttendanceRepository(t.f.clients, t.f.table), repo, t.studentRepo, t.coaches, clock);
        BookingService booking = new BookingService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), t.families, clock);

        dana = t.coach("Dana", DANA_CODE);
        new ScheduleService(repo, t.coaches).save(dana, 0, List.of(mondayMornings(5000)));
        new ScheduleChangeService(repo, t.coaches, clock).apply(dana);
        ClientContext park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE),
                FamilyTestSupport.kid("Ava Park", DANA_CODE), FamilyTestSupport.kid("Jack Park", DANA_CODE)));
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        ava = t.familyService.view(park).skaters().stream().filter(s -> s.name().equals("Ava Park")).findFirst().orElseThrow().studentId();
        jack = t.familyService.view(park).skaters().stream().filter(s -> s.name().equals("Jack Park")).findFirst().orElseThrow().studentId();
        for (String[] p : new String[][] {{ava, "06:00"}, {jack, "06:30"}, {ava, "07:30"}}) {
            booking.book(park, BookingRequest.parse(dana.coachId(), p[0], UUID.randomUUID().toString(),
                    List.of(new BookingRequest.PickInput(MONDAY.toString(), p[1]))));
        }
        now.set(Instant.parse("2026-11-16T13:15:00Z")); // Monday 7:15 AM: 6:00, 6:30 and 7:00 have started
    }

    @Test
    void theListShowsLessonsThatHappenedAtTheirShareWithTotalsPerCurrency() {
        attendance.record(dana, MONDAY, SIX_30, jack, "NO_SHOW", "2026-11-16T12:31:00Z");
        PaymentService.View v = service.list(dana, MONDAY, MONDAY);
        assertThat(v.rows()).extracting(r -> r.startTime() + " " + r.fullName() + " " + r.status())
                .containsExactly("06:00 Ava Park UNPAID", "06:30 Jack Park UNPAID");
        assertThat(v.rows().get(0).amountMinor()).isEqualTo(5000);
        assertThat(v.rows().get(0).familyName()).isEqualTo("Sarah Park");
        assertThat(v.rows().get(0).attendance()).isEqualTo(Attendance.Shown.NOT_RECORDED);
        assertThat(v.totals().unpaid()).containsExactly(Map.entry("USD", 10000L));
        assertThat(v.totals().unpaidCount()).isEqualTo(2);
        assertThat(v.totals().noShows()).isEqualTo(1);
        assertThat(v.totals().noShowsUnpaid()).containsExactly(Map.entry("USD", 5000L));
        assertThat(v.totals().notRecorded()).isEqualTo(1);
        assertThat(v.choices()).containsExactly(Payment.Via.VENMO, Payment.Via.OTHER);
        assertThat(v.currency()).isEqualTo("USD");
    }

    @Test
    void markPaidWithHowTheyPaidChangeItAndUndo() {
        assertThat(service.markPaid(dana, MONDAY, SIX, ava, "VENMO").paidVia()).isEqualTo(Payment.Via.VENMO);
        assertThat(service.markPaid(dana, MONDAY, SIX, ava, "OTHER").paidVia()).isEqualTo(Payment.Via.OTHER);
        PaymentService.View v = service.list(dana, MONDAY, MONDAY);
        assertThat(v.totals().paid()).containsExactly(Map.entry("USD", 5000L));
        assertThat(service.undo(dana, MONDAY, SIX, ava).status()).isEqualTo(Payment.Status.UNPAID);
        assertThatThrownBy(() -> service.markPaid(dana, MONDAY, SIX, ava, "CASH")).hasMessage("Pick how they paid from the list.");
    }

    @Test
    void waivedIsFinal() {
        assertThat(service.waive(dana, MONDAY, SIX, ava).status()).isEqualTo(Payment.Status.WAIVED);
        assertThatThrownBy(() -> service.undo(dana, MONDAY, SIX, ava)).hasMessage("A waived lesson can’t be changed.");
        assertThatThrownBy(() -> service.markPaid(dana, MONDAY, SIX, ava, "")).hasMessage("A waived lesson can’t be changed.");
        assertThat(service.list(dana, MONDAY, MONDAY).totals().unpaid()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void aLessonThatHasntHappenedIsntListedOrPaid() {
        assertThat(service.list(dana, MONDAY, MONDAY).rows()).noneMatch(r -> r.startTime().equals(LocalTime.of(7, 30)));
        assertThatThrownBy(() -> service.markPaid(dana, MONDAY, LocalTime.of(7, 30), ava, null)).hasMessage("That lesson hasn’t happened yet.");
        assertThatThrownBy(() -> service.list(dana, MONDAY, MONDAY.minusDays(1))).hasMessage("The end date is before the start date.");
        assertThatThrownBy(() -> service.waive(dana, MONDAY, LocalTime.of(9, 0), ava)).hasMessage("That lesson couldn’t be found.");
    }
}
