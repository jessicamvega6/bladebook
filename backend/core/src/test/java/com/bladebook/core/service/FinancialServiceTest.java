package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.FinancialRepository;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.FinancialSummary;
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

/** The financial page and its download (ADR-MASTER section 12 "Financial page"; ADR-030). */
class FinancialServiceTest {

    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);
    private static final LocalTime SIX_30 = LocalTime.of(6, 30);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private PaymentService service;
    private FinancialService finances;
    private FinancialRepository figures;
    private ClosedYearJob job;
    private com.bladebook.core.data.DynamoDbLocal.Fixture f;
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
        figures = new FinancialRepository(t.f.clients, t.f.table);
        finances = new FinancialService(service, t.coaches, figures, clock);
        job = new ClosedYearJob(new NotifyRepository(t.f.clients, t.f.table), finances);
        f = t.f;
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
    void thisYearCountsPaidLessonsIncludingANoShowMarkedPaid() {
        attendance.record(dana, MONDAY, SIX_30, jack, "NO_SHOW", "2026-11-16T12:31:00Z");
        service.markPaid(dana, MONDAY, SIX, ava, "VENMO");
        service.markPaid(dana, MONDAY, SIX_30, jack, "");

        FinancialService.Page p = finances.year(dana, 2026);
        assertThat(p.currency()).isEqualTo("USD");
        assertThat(p.summary().closed()).isFalse();
        assertThat(p.summary().months()).hasSize(11);
        FinancialSummary.Month nov = p.summary().months().get(10);
        assertThat(nov.paidLessons()).isEqualTo(2);
        assertThat(nov.gross()).containsExactly(Map.entry("USD", 10000L));
        assertThat(p.summary().gross()).containsExactly(Map.entry("USD", 10000L));
        assertThat(p.summary().unpaid()).isEmpty();   // the 7:30 lesson hasn't happened, so it's in neither
    }

    @Test
    void unpaidAndWaivedAreLeftOutAndUndoTakesALessonOut() {
        service.waive(dana, MONDAY, SIX, ava);
        service.markPaid(dana, MONDAY, SIX_30, jack, "");
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
        service.undo(dana, MONDAY, SIX_30, jack);
        FinancialService.Page p = finances.year(dana, 2026);
        assertThat(p.summary().gross()).isEmpty();
        assertThat(p.summary().unpaid()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void theDownloadIsThisYearOrLast() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        FinancialService.Download d = finances.download(dana, 2026);
        assertThat(d.fileName()).isEqualTo("bladebook-summary-2026.csv");
        assertThat(d.csv()).contains("November 2026 (to Nov 16),1,50.00,0.00\r\n2026 to date,1,50.00,0.00\r\n");
        assertThat(d.csv()).doesNotContain("Ava");
        FinancialService.Download last = finances.download(dana, 2025);
        assertThat(last.csv()).contains("December 2025,0,0.00,0.00\r\n2025 total,0,0.00,0.00\r\n");
        assertThatThrownBy(() -> finances.download(dana, 2024)).hasMessage("Pick this year or last year.");
        assertThatThrownBy(() -> finances.year(dana, 2027)).hasMessage("Pick this year or last year.");
    }

    @Test
    void theYearFollowsTheCoachsTimeZone() {
        now.set(Instant.parse("2027-01-01T03:00:00Z")); // 9:00 PM on Dec 31 in Chicago: still 2026
        assertThat(finances.year(dana, 2026).summary().closed()).isFalse();
        assertThat(finances.year(dana, 2026).summary().months()).hasSize(12);
    }

    @Test
    void lastYearsLessonPaidInJanuaryCountsInJanuaryMarkedAsForLastYear() {
        service.markPaid(dana, MONDAY, SIX, ava, "");                 // paid in 2026: 2026's
        now.set(Instant.parse("2027-01-05T15:00:00Z"));
        service.markPaid(dana, MONDAY, SIX_30, jack, "");              // a 2026 lesson paid in January 2027
        FinancialService.Page p = finances.year(dana, 2027);
        FinancialSummary.Month jan = p.summary().months().get(0);
        assertThat(jan.paidLessons()).isEqualTo(1);
        assertThat(jan.earlierLessons()).isEqualTo(1);
        assertThat(jan.earlierGross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(p.summary().gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(p.summary().unpaid()).isEmpty();                    // 2026's unpaid 7:30 lesson isn't 2027's
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
    }

    // ------------------------------------------------------------- Batch 26: closed years saved (G-36)

    private static final Instant JAN_1_2027_CHICAGO = Instant.parse("2027-01-01T06:00:00Z");

    private FinancialSummary.Month january(int year) {
        return finances.year(dana, year).summary().months().get(0);
    }

    @Test
    void theJanuaryJobSavesLastYearOnceAndASecondRunChangesNothing() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        now.set(Instant.parse("2027-01-01T14:00:00Z"));
        assertThat(job.run(LocalDate.of(2027, 1, 1))).isEqualTo(new ClosedYearJob.Result(1, 1, 0, 0));
        FinancialRepository.SavedYear saved = figures.savedYear(dana, 2026).orElseThrow();
        assertThat(saved.savedBy()).isEqualTo(FinancialRepository.SavedBy.JOB);
        assertThat(saved.months().get(10).gross()).containsExactly(Map.entry("USD", 5000L));

        service.markPaid(dana, MONDAY, SIX_30, jack, "");                  // a 2026 lesson paid late: 2027's
        assertThat(job.run(LocalDate.of(2027, 1, 2))).isEqualTo(new ClosedYearJob.Result(1, 0, 1, 0));
        assertThat(figures.savedYear(dana, 2026).orElseThrow().savedAt()).isEqualTo(Instant.parse("2027-01-01T14:00:00Z"));
        FinancialService.Page p = finances.year(dana, 2026);
        assertThat(p.summary().closed()).isTrue();
        assertThat(p.summary().gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(january(2027).earlierGross()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void theYearClosesAtMidnightInTheCoachsTimeZoneSoTheJobWaitsForIt() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        now.set(JAN_1_2027_CHICAGO.minusSeconds(1));                      // 11:59:59 PM on Dec 31 in Chicago
        assertThat(job.run(LocalDate.of(2027, 1, 1))).isEqualTo(new ClosedYearJob.Result(1, 0, 0, 1));
        assertThat(figures.savedYear(dana, 2026)).isEmpty();
        service.undo(dana, MONDAY, SIX, ava);                              // 2026 is still open: an ordinary undo
        assertThat(finances.year(dana, 2026).summary().gross()).isEmpty();
        service.markPaid(dana, MONDAY, SIX, ava, "");

        now.set(JAN_1_2027_CHICAGO);
        assertThat(job.run(LocalDate.of(2027, 1, 1))).isEqualTo(new ClosedYearJob.Result(1, 1, 0, 0));
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void theFirstReadOfAClosedYearSavesItIfTheJobHasnt() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        now.set(Instant.parse("2027-01-05T15:00:00Z"));
        assertThat(figures.savedYear(dana, 2026)).isEmpty();
        FinancialService.Download d = finances.download(dana, 2026);
        assertThat(d.csv()).contains("November 2026,1,50.00,0.00\r\n").endsWith("2026 total,1,50.00,0.00\r\n");
        assertThat(figures.savedYear(dana, 2026).orElseThrow().savedBy()).isEqualTo(FinancialRepository.SavedBy.READ);
        assertThat(job.run(LocalDate.of(2027, 1, 6))).isEqualTo(new ClosedYearJob.Result(1, 0, 1, 0));
    }

    @Test
    void anUndoAfterTheYearClosedLowersThisYearAndLeavesTheClosedYearAlone() {
        service.markPaid(dana, MONDAY, SIX, ava, "VENMO");
        now.set(Instant.parse("2027-01-01T14:00:00Z"));
        job.run(LocalDate.of(2027, 1, 1));

        now.set(Instant.parse("2027-02-03T15:00:00Z"));
        service.undo(dana, MONDAY, SIX, ava);
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
        FinancialSummary.Summary y = finances.year(dana, 2027).summary();
        FinancialSummary.Month feb = y.months().get(1);
        assertThat(feb.gross()).containsExactly(Map.entry("USD", -5000L));
        assertThat(feb.undoneLessons()).isEqualTo(1);
        assertThat(feb.undoneGross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(feb.paidLessons()).isZero();
        assertThat(y.gross()).containsExactly(Map.entry("USD", -5000L));
        assertThat(finances.download(dana, 2027).csv()).contains("February 2027 (to Feb 3),0,-50.00,-50.00\r\n");

        // Marked paid again later: it counts as a late payment, so this year nets to nothing.
        now.set(Instant.parse("2027-03-03T15:00:00Z"));
        service.markPaid(dana, MONDAY, SIX, ava, "OTHER");
        y = finances.year(dana, 2027).summary();
        assertThat(y.gross()).containsExactly(Map.entry("USD", 0L));
        assertThat(y.months().get(2).earlierGross()).containsExactly(Map.entry("USD", 5000L));
        // And undone again: that payment counted in 2027, which is open, so it just drops out.
        service.undo(dana, MONDAY, SIX, ava);
        assertThat(finances.year(dana, 2027).summary().gross()).containsExactly(Map.entry("USD", -5000L));
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void anUndoBeforeTheYearIsSavedSavesItFirst() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        now.set(Instant.parse("2027-01-01T07:00:00Z"));                   // closed, but the job hasn't run
        service.undo(dana, MONDAY, SIX, ava);
        FinancialRepository.SavedYear saved = figures.savedYear(dana, 2026).orElseThrow();
        assertThat(saved.savedBy()).isEqualTo(FinancialRepository.SavedBy.UNDO);
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(january(2027).gross()).containsExactly(Map.entry("USD", -5000L));
    }

    @Test
    void undoingALatePaymentChangesOnlyTheYearItWasPaidIn() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        now.set(Instant.parse("2027-01-05T15:00:00Z"));
        service.markPaid(dana, MONDAY, SIX_30, jack, "");                  // a 2026 lesson paid in 2027
        now.set(Instant.parse("2027-02-05T15:00:00Z"));
        service.undo(dana, MONDAY, SIX_30, jack);
        assertThat(finances.year(dana, 2027).summary().gross()).isEmpty();
        assertThat(finances.year(dana, 2027).summary().undoneLessons()).isZero();
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void aClosedYearKeepsItsFiguresWhenItsRecordsAreDeleted() {
        service.markPaid(dana, MONDAY, SIX, ava, "");
        now.set(Instant.parse("2027-01-01T14:00:00Z"));
        job.run(LocalDate.of(2027, 1, 1));
        f.clients.forSetup().deleteItem(b -> b.tableName(f.table)        // as the TTL will, about 16 months on (Batch 17)
                .key(Map.of("PK", software.amazon.awssdk.services.dynamodb.model.AttributeValue.fromS(dana.partitionKey()),
                        "SK", software.amazon.awssdk.services.dynamodb.model.AttributeValue.fromS(
                                com.bladebook.core.domain.Seat.key(MONDAY, SIX, ava)))));
        assertThat(finances.year(dana, 2026).summary().gross()).containsExactly(Map.entry("USD", 5000L));
        assertThat(finances.year(dana, 2026).summary().months().get(10).hasLessons()).isTrue();
    }

    @Test
    void theJobGoesOnPastACoachWhoHasntFinishedSettingUp() {
        now.set(Instant.parse("2027-01-01T14:00:00Z"));
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(Map.of(
                "PK", software.amazon.awssdk.services.dynamodb.model.AttributeValue.fromS("COACH#" + UUID.randomUUID()),
                "SK", software.amazon.awssdk.services.dynamodb.model.AttributeValue.fromS("PROFILE"))));
        ClosedYearJob.Result r = job.run(LocalDate.of(2027, 1, 1));
        assertThat(r.saved()).isEqualTo(1);
        assertThat(r.coaches()).isEqualTo(1);
    }

    @Test
    void aCoachWhoHasntFinishedSettingUpIsToldSo() {
        AccessContext stranger = new AccessContext(UUID.randomUUID().toString());
        assertThatThrownBy(() -> finances.year(stranger, 2026)).hasMessage("Finish setting up your account first.");
    }
}
