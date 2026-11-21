package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.service.CancellationService.FamilyCancel;
import com.bladebook.core.service.CancellationService.Outcome;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A family cancels one lesson (ADR-MASTER section 10; FeatureDecriptions/cancelation.md, Client cancelation). */
class CancellationServiceTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private FamilyTestSupport t;
    private CancellationService service;
    private BookingService booking;
    private CancellationRepository cancelRepo;
    private ScheduleRepository scheduleRepo;
    private AccessContext dana;
    private ClientContext park;
    private String ava;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        scheduleRepo = new ScheduleRepository(t.f.clients, t.f.table);
        cancelRepo = new CancellationRepository(t.f.clients, t.f.table);
        BookingRepository bookingRepo = new BookingRepository(t.f.clients, t.f.table);
        ClientLinks links = new ClientLinks(t.f.clients, t.f.table);
        booking = new BookingService(links, bookingRepo, t.families, clock);
        service = new CancellationService(links, bookingRepo, cancelRepo, clock);

        dana = t.coach("Dana", DANA_CODE);
        new ScheduleService(scheduleRepo, t.coaches).save(dana, 0, List.of(mondayMornings(5000)));
        new ScheduleChangeService(scheduleRepo, t.coaches, clock).apply(dana);

        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE),
                FamilyTestSupport.kid("Ava Park", DANA_CODE), FamilyTestSupport.kid("Jack Park", DANA_CODE)));
        ava = t.familyService.view(park).skaters().stream().filter(s -> s.name().equals("Ava Park")).findFirst().orElseThrow().studentId();
        t.studentRepo.list(dana).stream().filter(r -> r.studentName().equals("Ava Park"))
                .forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        booking.book(park, BookingRequest.parse(dana.coachId(), ava, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(MONDAY.toString(), "06:00"))));
    }

    private LessonTime six() {
        return scheduleRepo.lessonTimes(dana, MONDAY, MONDAY).stream().filter(l -> l.startTime().equals(SIX)).findFirst().orElseThrow();
    }

    @Test
    void cancellingInTimeReopensTheTimeAndIsNotLate() {
        now.set(Instant.parse("2026-11-15T12:00:00Z")); // exactly 24 hours before

        FamilyCancel c = service.cancel(park, dana.coachId(), ava, MONDAY, SIX);

        assertThat(c.outcome()).isEqualTo(Outcome.CANCELLED);
        assertThat(c.late()).isFalse();
        assertThat(c.coachFirstName()).isEqualTo("Dana");
        assertThat(c.studentName()).isEqualTo("Ava Park");
        assertThat(six().lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(booking.page(park, dana.coachId(), ava).times().get(0).free()).isTrue();
    }

    @Test
    void cancellingInsideTheNoticePeriodIsLate() {
        now.set(Instant.parse("2026-11-15T12:00:01Z"));
        assertThat(service.cancel(park, dana.coachId(), ava, MONDAY, SIX).late()).isTrue();
    }

    @Test
    void theLineRecordsTheFamilyThePriceAndTheNotice() {
        now.set(Instant.parse("2026-11-15T14:30:00Z"));
        service.cancel(park, dana.coachId(), ava, MONDAY, SIX);

        List<CancellationLine> lines = cancelRepo.lines(dana);
        assertThat(lines).hasSize(1);
        CancellationLine l = lines.get(0);
        assertThat(l.cancelledBy()).isEqualTo(ChangeBatch.By.CLIENT);
        assertThat(l.clientId()).isEqualTo(park.clientId());
        assertThat(l.studentName()).isEqualTo("Ava P.");
        assertThat(l.priceMinor()).isEqualTo(5000);
        assertThat(l.noticeHours()).isEqualTo(21);
        ChangeBatch b = cancelRepo.batches(dana).get(0);
        assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.LESSON);
        assertThat(b.actedBy()).isEqualTo(park.clientId());
        assertThat(b.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(b.lessonCount()).isEqualTo(1);
    }

    @Test
    void askingAgainAnswersAlreadyCancelledAndWritesNothing() {
        now.set(Instant.parse("2026-11-12T12:00:00Z"));
        service.cancel(park, dana.coachId(), ava, MONDAY, SIX);

        FamilyCancel again = service.cancel(park, dana.coachId(), ava, MONDAY, SIX);
        assertThat(again.outcome()).isEqualTo(Outcome.ALREADY_CANCELLED);
        assertThat(cancelRepo.lines(dana)).hasSize(1);
    }

    @Test
    void aLessonThatHasStartedCantBeCancelled() {
        now.set(Instant.parse("2026-11-16T12:00:00Z"));
        assertThatThrownBy(() -> service.cancel(park, dana.coachId(), ava, MONDAY, SIX))
                .isInstanceOf(DomainException.class).hasMessage("This lesson has already started, so it can’t be cancelled.");
        assertThat(six().lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void aSkaterWhoWasNeverTheFamilysIsAPlainNotFound() {
        assertThatThrownBy(() -> service.cancel(park, dana.coachId(), UUID.randomUUID().toString(), MONDAY, SIX))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NO_SUCH_ITEM));
    }

    @Test
    void aLessonTheFamilyNeverHadIsAlreadyCancelledNotSomeoneElses() {
        now.set(Instant.parse("2026-11-12T12:00:00Z"));
        assertThat(service.cancel(park, dana.coachId(), ava, MONDAY, LocalTime.of(6, 30)).outcome()).isEqualTo(Outcome.ALREADY_CANCELLED);
        assertThat(cancelRepo.lines(dana)).isEmpty();
    }

    @Test
    void afterCancellingTheSkaterCanBookTheTimeAgain() {
        now.set(Instant.parse("2026-11-12T12:00:00Z"));
        service.cancel(park, dana.coachId(), ava, MONDAY, SIX);
        var again = booking.book(park, BookingRequest.parse(dana.coachId(), ava, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(MONDAY.toString(), "06:00"))));
        assertThat(again.picks().get(0).outcome()).isEqualTo(com.bladebook.core.domain.BookingOutcome.BOOKED);
    }
}
