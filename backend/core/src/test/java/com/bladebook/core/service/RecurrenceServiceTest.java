package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.Recurrence;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Changing a repeating booking: end earlier, less often, or stop (ADR-MASTER section 10, "By the family"). */
class RecurrenceServiceTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-10T15:00:00Z"));
    private FamilyTestSupport t;
    private RecurrenceService service;
    private BookingService booking;
    private CancellationRepository cancelRepo;
    private AccessContext dana;
    private ClientContext park;
    private String rid;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        ScheduleRepository repo = new ScheduleRepository(t.f.clients, t.f.table);
        BookingRepository bookingRepo = new BookingRepository(t.f.clients, t.f.table);
        ClientLinks links = new ClientLinks(t.f.clients, t.f.table);
        cancelRepo = new CancellationRepository(t.f.clients, t.f.table);
        booking = new BookingService(links, bookingRepo, t.families, clock);
        service = new RecurrenceService(links, bookingRepo, cancelRepo, clock);
        dana = t.coach("Dana", DANA_CODE);
        new ScheduleService(repo, t.coaches).save(dana, 0, List.of(mondayMornings(5000)));
        new ScheduleChangeService(repo, t.coaches, clock).apply(dana);
        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE), FamilyTestSupport.kid("Ava Park", DANA_CODE)));
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        String ava = t.familyService.view(park).skaters().get(0).studentId();
        // Mondays at 6:00, Nov 16 to Dec 21: six lessons.
        rid = booking.book(park, BookingRequest.parse(dana.coachId(), ava, "series-key-0001",
                List.of(new BookingRequest.PickInput(MONDAY.toString(), "06:00")), true, 1, "2026-12-21")).series().get(0).recurrenceId();
        now.set(Instant.parse("2026-11-16T15:00:00Z")); // Monday 9 AM: today's 6:00 has happened
    }

    private List<String> left() {
        return booking.myBookings(park).upcoming().stream().map(l -> l.lesson().date().toString()).toList();
    }

    @Test
    void endingEarlierCancelsTheLaterDatesAsOneBatch() {
        RecurrenceService.Changed c = service.change(park, dana.coachId(), rid, "END_EARLIER", "2026-12-07", null);
        assertThat(c.cancelled()).isEqualTo(2);
        assertThat(c.after().endDate()).isEqualTo(LocalDate.of(2026, 12, 7));
        assertThat(left()).containsExactly("2026-11-23", "2026-11-30", "2026-12-07");
        ChangeBatch b = cancelRepo.batches(dana).get(0);
        assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.RECURRENCE);
        assertThat(b.lessonCount()).isEqualTo(2);
        assertThat(b.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
    }

    @Test
    void lessOftenKeepsTheNextLessonAndEveryOtherAfterIt() {
        RecurrenceService.Changed c = service.change(park, dana.coachId(), rid, "LESS_OFTEN", null, 2);
        assertThat(c.cancelled()).isEqualTo(2);
        assertThat(left()).containsExactly("2026-11-23", "2026-12-07", "2026-12-21");
        assertThat(booking.myBookings(park).upcoming()).allMatch(l -> l.intervalWeeks() == 2);
    }

    @Test
    void stoppingCancelsEverythingStillToComeAndEndsTheSeries() {
        RecurrenceService.Changed c = service.change(park, dana.coachId(), rid, "STOP", null, null);
        assertThat(c.cancelled()).isEqualTo(5);
        assertThat(c.after().status()).isEqualTo(Recurrence.Status.ENDED);
        assertThat(left()).isEmpty();
        assertThat(booking.myBookings(park).series()).isEmpty();
        assertThatThrownBy(() -> service.change(park, dana.coachId(), rid, "STOP", null, null)).hasMessage("That repeating lesson has ended.");
    }

    @Test
    void aLessonInsideTheNoticePeriodMakesItLate() {
        now.set(Instant.parse("2026-11-22T15:00:00Z")); // Sunday 9 AM: Monday's 6:00 is 21 hours away
        assertThat(service.change(park, dana.coachId(), rid, "STOP", null, null).late()).isTrue();
    }

    @Test
    void todaysLessonIsNeverPartOfTheFuture() {
        now.set(Instant.parse("2026-11-23T10:00:00Z")); // Monday 4 AM: today's 6:00 hasn't started, but it's today
        assertThat(service.change(park, dana.coachId(), rid, "STOP", null, null).cancelled()).isEqualTo(4);
        assertThat(left()).containsExactly("2026-11-23");
    }

    @Test
    void someoneElsesSeriesIsNotFoundAndAWrongChoiceIsRefused() {
        assertThatThrownBy(() -> service.change(park, dana.coachId(), "nope", "STOP", null, null))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NO_SUCH_ITEM));
        assertThatThrownBy(() -> service.change(park, dana.coachId(), rid, "MORE", null, null)).hasMessage("Choose how to change it.");
        assertThatThrownBy(() -> service.change(park, dana.coachId(), rid, "LESS_OFTEN", null, 1)).hasMessage("Pick a less frequent option.");
    }
}
