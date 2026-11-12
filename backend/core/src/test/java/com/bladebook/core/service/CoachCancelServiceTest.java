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
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.CoachCancelRequest.PickInput;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
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

/** The coach cancels a lesson, a day or the rest of the week (ADR-MASTER section 10; S8, S9). */
class CoachCancelServiceTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalDate SUNDAY = LocalDate.of(2026, 11, 15);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private FamilyTestSupport t;
    private CoachCancelService service;
    private BookingService booking;
    private CancellationRepository cancelRepo;
    private ScheduleRepository scheduleRepo;
    private AccessContext dana;
    private ClientContext park;
    private ClientContext rossi;
    private String ava;
    private String jack;
    private String mia;

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
        booking = new BookingService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), t.families, clock);
        service = new CoachCancelService(scheduleRepo, cancelRepo, clock);

        dana = t.coach("Dana", DANA_CODE);
        new ScheduleService(scheduleRepo, t.coaches).save(dana, 0, List.of(mondayMornings(5000)));
        new ScheduleChangeService(scheduleRepo, t.coaches, clock).apply(dana);

        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE),
                FamilyTestSupport.kid("Ava Park", DANA_CODE), FamilyTestSupport.kid("Jack Park", DANA_CODE)));
        rossi = FamilyTestSupport.newFamily();
        t.registration.register(rossi, "gina@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE),
                FamilyTestSupport.kid("Mia Rossi", DANA_CODE)));
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        ava = id(park, "Ava Park");
        jack = id(park, "Jack Park");
        mia = id(rossi, "Mia Rossi");
        book(park, ava, "06:00");
        book(park, jack, "06:30");
        book(rossi, mia, "07:00");
    }

    private String id(ClientContext family, String name) {
        return t.familyService.view(family).skaters().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow().studentId();
    }

    private void book(ClientContext family, String studentId, String time) {
        booking.book(family, BookingRequest.parse(dana.coachId(), studentId, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(MONDAY.toString(), time))));
    }

    private LessonTime.Status status(String time) {
        return scheduleRepo.lessonTimes(dana, MONDAY, MONDAY).stream().filter(l -> l.startTime().equals(LocalTime.parse(time)))
                .findFirst().orElseThrow().lessonStatus();
    }

    private static PickInput pick(String time, String after) {
        return new PickInput(MONDAY.toString(), time, after);
    }

    @Test
    void oneLessonHeldIsABatchOfOneAndTheTimeStaysClosed() {
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(pick("06:00", "HOLD")), null));

        assertThat(r).isEqualTo(new CoachCancelService.Result(1, 1, 0, 1, 0));
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.HELD);
        assertThat(cancelRepo.lines(dana)).extracting(CancellationLine::studentId).containsExactly(ava);
        assertThat(cancelRepo.lines(dana).get(0).cancelledBy()).isEqualTo(ChangeBatch.By.COACH);
        ChangeBatch b = cancelRepo.batches(dana).get(0);
        assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.LESSON);
        assertThat(b.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(b.actedBy()).isEqualTo(dana.coachId());
    }

    @Test
    void aDayAsksEachLessonAndOneFamilyWithTwoSkatersIsOneEmail() {
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("DAY",
                List.of(pick("06:00", "RELEASE"), pick("06:30", "HOLD"), pick("07:00", "RELEASE")), null));

        assertThat(r.cancelled()).isEqualTo(3);
        assertThat(r.held()).isEqualTo(1);
        assertThat(r.families()).isEqualTo(2);
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.OPEN);
        assertThat(status("06:30")).isEqualTo(LessonTime.Status.HELD);
        assertThat(status("07:00")).isEqualTo(LessonTime.Status.OPEN);
        assertThat(scheduleRepo.seats(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(cancelRepo.lines(dana)).hasSize(3);
        ChangeBatch b = cancelRepo.batches(dana).get(0);
        assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.DAY);
        assertThat(b.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(b.lessonCount()).isEqualTo(3);
        assertThat(b.clientCount()).isEqualTo(2);
        assertThat(b.affectedFrom()).isEqualTo(MONDAY);
    }

    @Test
    void aDayFromNowOnLeavesLessonsThatHaveStarted() {
        now.set(Instant.parse("2026-11-16T12:15:00Z")); // Monday 6:15 AM: the 6:00 has started
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("DAY",
                List.of(pick("06:00", "RELEASE"), pick("06:30", "RELEASE")), null));
        assertThat(r.cancelled()).isEqualTo(1);
        assertThat(r.skipped()).isEqualTo(1);
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(status("06:30")).isEqualTo(LessonTime.Status.OPEN);
    }

    @Test
    void theRestOfTheWeekHoldsEveryBookedLessonAndOpenTime() {
        now.set(Instant.parse("2026-11-16T12:45:00Z")); // Monday 6:45 AM: 6:00 and 6:30 have started
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("WEEK", null, SUNDAY.toString()));

        assertThat(r.cancelled()).isEqualTo(1);          // Mia's 7:00
        assertThat(r.held()).isEqualTo(1);
        assertThat(r.openHeld()).isEqualTo(1);           // the open 7:30
        assertThat(r.families()).isEqualTo(1);
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(status("06:30")).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(status("07:00")).isEqualTo(LessonTime.Status.HELD);
        assertThat(status("07:30")).isEqualTo(LessonTime.Status.HELD);
        // The weekly schedule isn't changed, so next Monday is untouched.
        assertThat(scheduleRepo.lessonTimes(dana, MONDAY.plusDays(7), MONDAY.plusDays(7)))
                .allMatch(l -> l.lessonStatus() == LessonTime.Status.OPEN);
        assertThat(cancelRepo.batches(dana).get(0).batchSource()).isEqualTo(ChangeBatch.Source.WEEK);
    }

    @Test
    void aLessonTheFamilyCancelledFirstIsSkippedAndNothingIsLeftHalfDone() {
        new CancellationService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), cancelRepo,
                Clock.fixed(BOOKED_AT, ZoneOffset.UTC)).cancel(park, dana.coachId(), ava, MONDAY, LocalTime.of(6, 0));

        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("DAY",
                List.of(pick("06:00", "HOLD"), pick("06:30", "RELEASE")), null));
        assertThat(r.cancelled()).isEqualTo(1);
        assertThat(r.skipped()).isEqualTo(1);
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.OPEN);
    }

    @Test
    void nothingLeftToCancelIsRefused() {
        assertThatThrownBy(() -> service.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(pick("07:30", "HOLD")), null)))
                .isInstanceOf(DomainException.class).hasMessage("These lessons have already started or were cancelled.");
        assertThat(cancelRepo.batches(dana)).isEmpty();
    }

    @Test
    void cancellingNeverChangesTheSchedule() {
        var before = new ScheduleService(scheduleRepo, t.coaches).schedule(dana);
        service.cancel(dana, CoachCancelRequest.parse("WEEK", null, SUNDAY.toString()));
        assertThat(new ScheduleService(scheduleRepo, t.coaches).schedule(dana)).isEqualTo(before);
    }
}
