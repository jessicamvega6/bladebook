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
import com.bladebook.core.domain.TodayBoard;
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

/** The coach's Today page (G-6, Batch 22): today's lessons, this week's and the unpaid figures, against DynamoDB Local. */
class TodayServiceTest {

    private static final LocalDate LAST_MONDAY = LocalDate.of(2026, 11, 9);
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalDate NEXT_MONDAY = LocalDate.of(2026, 11, 23);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-01T15:00:00Z"));
    private TodayService service;
    private PaymentService payments;
    private AttendanceService attendance;
    private AccessContext dana;
    private String ava;
    private String jack;
    private FamilyTestSupport t;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        ScheduleRepository repo = new ScheduleRepository(t.f.clients, t.f.table);
        PaymentRepository paymentRepo = new PaymentRepository(t.f.clients, t.f.table);
        service = new TodayService(paymentRepo, repo, t.studentRepo, t.coaches, clock);
        payments = new PaymentService(paymentRepo, repo, t.studentRepo, t.coaches, clock);
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
        Object[][] picks = {{ava, LAST_MONDAY, "06:00"}, {ava, MONDAY, "06:00"}, {jack, MONDAY, "06:30"}, {ava, MONDAY, "07:30"},
                {jack, NEXT_MONDAY, "06:00"}};
        for (Object[] p : picks) {
            booking.book(park, BookingRequest.parse(dana.coachId(), (String) p[0], UUID.randomUUID().toString(),
                    List.of(new BookingRequest.PickInput(p[1].toString(), (String) p[2]))));
        }
        now.set(Instant.parse("2026-11-16T13:15:00Z")); // Monday 7:15 AM in Chicago: 6:00, 6:30 and 7:00 have started
    }

    @Test
    void todaysLessonsAreListedWithTheNextOneMarkedAndEachSkatersAttendance() {
        attendance.record(dana, MONDAY, LocalTime.of(6, 0), ava, "CHECKED_IN", "2026-11-16T12:01:00Z");

        TodayService.View v = service.today(dana);

        assertThat(v.today()).isEqualTo(MONDAY);
        assertThat(v.now()).isEqualTo(LocalTime.of(7, 15));
        assertThat(v.coachTimezone()).isEqualTo("America/Chicago");
        assertThat(v.lessons()).extracting(l -> l.time().startTime() + " " + l.skaters().get(0).name() + " " + l.skaters().get(0).shown() + " " + l.next())
                .containsExactly("06:00 Ava Park CHECKED_IN false", "06:30 Jack Park NOT_RECORDED false", "07:30 Ava Park BOOKED true");
        assertThat(v.lessons().get(0).skaters().get(0).amountMinor()).isEqualTo(5000);
        assertThat(v.nextLessonDate()).isNull();
    }

    @Test
    void theWeekIsSundayToSaturdayAndCountsEveryLessonBookedInIt() {
        TodayService.View v = service.today(dana);
        assertThat(v.weekStart()).isEqualTo(LocalDate.of(2026, 11, 15));
        assertThat(v.weekEnd()).isEqualTo(LocalDate.of(2026, 11, 21));
        assertThat(v.week().count()).isEqualTo(3);
        assertThat(v.week().amounts()).containsExactly(Map.entry("USD", 15000L));
        assertThat(v.currency()).isEqualTo("USD");
    }

    @Test
    void unpaidReachesBackToTheOldestUnpaidLessonAndCountsOnlyLessonsThatHaveStarted() {
        TodayService.View v = service.today(dana);
        assertThat(v.unpaid().count()).isEqualTo(3);
        assertThat(v.unpaid().amounts()).containsExactly(Map.entry("USD", 15000L));

        payments.markPaid(dana, LAST_MONDAY, LocalTime.of(6, 0), ava, "");
        payments.waive(dana, MONDAY, LocalTime.of(6, 30), jack);
        TodayService.View after = service.today(dana);
        assertThat(after.unpaid().count()).isEqualTo(1);
        assertThat(after.unpaid().amounts()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void aNoShowStaysUnpaidUntilTheCoachMarksItPaidOrWaived() {
        attendance.record(dana, MONDAY, LocalTime.of(6, 30), jack, "NO_SHOW", "2026-11-16T12:31:00Z");
        TodayService.View v = service.today(dana);
        assertThat(v.lessons().get(1).skaters().get(0).shown()).isEqualTo(Attendance.Shown.NO_SHOW);
        assertThat(v.unpaid().count()).isEqualTo(3);
    }

    @Test
    void theFiguresMatchThePaymentsPagesUnpaidTotal() {
        PaymentService.View page = payments.list(dana, LAST_MONDAY, MONDAY);
        TodayBoard.Figures unpaid = service.today(dana).unpaid();
        assertThat(unpaid.count()).isEqualTo(page.totals().unpaidCount());
        assertThat(unpaid.amounts()).isEqualTo(page.totals().unpaid());
    }

    @Test
    void aDayWithNoLessonsSaysWhenTheNextOneIs() {
        now.set(Instant.parse("2026-11-17T14:00:00Z")); // Tuesday
        TodayService.View v = service.today(dana);
        assertThat(v.lessons()).isEmpty();
        assertThat(v.nextLessonDate()).isEqualTo(NEXT_MONDAY);
    }

    @Test
    void aDayWithNoLessonsAndNothingBookedAfterHasNoNextLesson() {
        now.set(Instant.parse("2026-11-24T14:00:00Z")); // the Tuesday after the last booking
        TodayService.View v = service.today(dana);
        assertThat(v.lessons()).isEmpty();
        assertThat(v.nextLessonDate()).isNull();
        assertThat(v.week().count()).isEqualTo(1);   // next Monday's lesson, in this week
        assertThat(v.unpaid().count()).isEqualTo(5);
    }

    @Test
    void aCoachWithNothingBookedSeesZeroes() {
        AccessContext sam = t.coach("Sam", "8M3R-P2WX");
        TodayService.View v = service.today(sam);
        assertThat(v.lessons()).isEmpty();
        assertThat(v.week().count()).isZero();
        assertThat(v.unpaid().amounts()).isEmpty();
        assertThat(v.nextLessonDate()).isNull();
    }

    @Test
    void aCoachWhoHasntFinishedSettingUpIsToldSo() {
        AccessContext stranger = new AccessContext(UUID.randomUUID().toString());
        assertThatThrownBy(() -> service.today(stranger)).hasMessage("Finish setting up your account first.");
    }
}
