package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.Attendance;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.CoachCancelRequest;
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

/** Attendance: rinkside capture and the Lessons page's corrections (ADR-MASTER section 11). */
class AttendanceServiceTest {

    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    /** Monday, 6:40 AM in Chicago: the 6:00 and 6:30 have started. */
    private static final Instant MONDAY_640 = Instant.parse("2026-11-16T12:40:00Z");
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private AttendanceService service;
    private CoachCancelService cancels;
    private CancellationService familyCancels;
    private ClientContext park;
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
        service = new AttendanceService(new AttendanceRepository(t.f.clients, t.f.table), repo, t.studentRepo, t.coaches,
                new CancellationRepository(t.f.clients, t.f.table), clock);
        familyCancels = new CancellationService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table),
                new CancellationRepository(t.f.clients, t.f.table), clock);
        cancels = new CoachCancelService(repo, new CancellationRepository(t.f.clients, t.f.table), clock);
        BookingService booking = new BookingService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), t.families, clock);

        dana = t.coach("Dana", DANA_CODE);
        new ScheduleService(repo, t.coaches).save(dana, 0, List.of(mondayMornings(5000)));
        new ScheduleChangeService(repo, t.coaches, clock).apply(dana);
        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE),
                FamilyTestSupport.kid("Ava Park", DANA_CODE), FamilyTestSupport.kid("Jack Park", DANA_CODE)));
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        ava = t.familyService.view(park).skaters().stream().filter(s -> s.name().equals("Ava Park")).findFirst().orElseThrow().studentId();
        jack = t.familyService.view(park).skaters().stream().filter(s -> s.name().equals("Jack Park")).findFirst().orElseThrow().studentId();
        for (String[] p : new String[][] {{ava, "06:00"}, {jack, "06:30"}, {ava, "07:30"}}) {
            booking.book(park, BookingRequest.parse(dana.coachId(), p[0], UUID.randomUUID().toString(),
                    List.of(new BookingRequest.PickInput(MONDAY.toString(), p[1]))));
        }
        now.set(MONDAY_640);
    }

    private AttendanceService.Skater record(String studentId, String time, String outcome, String at) {
        return service.record(dana, MONDAY, LocalTime.parse(time), studentId, outcome, at);
    }

    @Test
    void todayListsBookedAndHeldTimesWithEachSkatersOutcome() {
        cancels.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(new CoachCancelRequest.PickInput(MONDAY.toString(), "07:30", "HOLD")), null));
        AttendanceService.RinkDay d = service.today(dana);
        assertThat(d.today()).isEqualTo(MONDAY);
        assertThat(d.now()).isEqualTo(LocalTime.of(6, 40));
        assertThat(d.lessons()).extracting(l -> l.time().startTime() + " " + l.time().lessonStatus())
                .containsExactly("06:00 BOOKED", "06:30 BOOKED", "07:30 HELD");
        AttendanceService.Skater six = d.lessons().get(0).skaters().get(0);
        assertThat(six.shortName()).isEqualTo("Ava P.");
        assertThat(six.fullName()).isEqualTo("Ava Park");
        assertThat(six.familyName()).isEqualTo("Sarah Park");
        assertThat(six.status()).isEqualTo(Attendance.Shown.NOT_RECORDED);
        assertThat(d.lessons().get(1).skaters().get(0).status()).isEqualTo(Attendance.Shown.BOOKED);
        assertThat(d.lessons().get(2).skaters()).isEmpty();
    }

    @Test
    void recordingKeepsTheTapTimeAndASecondTapChangesNothing() {
        AttendanceService.Skater s = record(ava, "06:00", "CHECKED_IN", "2026-11-16T12:02:00Z");
        assertThat(s.status()).isEqualTo(Attendance.Shown.CHECKED_IN);
        assertThat(s.outcomeAt()).isEqualTo(Instant.parse("2026-11-16T12:02:00Z"));
        assertThat(record(ava, "06:00", "NO_SHOW", "2026-11-16T12:30:00Z").status()).isEqualTo(Attendance.Shown.CHECKED_IN);
    }

    @Test
    void aTapTimeThatDoesntFitTheLessonIsRefused() {
        assertThatThrownBy(() -> record(ava, "06:00", "CHECKED_IN", "2026-11-15T12:00:00Z"))
                .isInstanceOf(DomainException.class).hasMessage("The phone’s time didn’t match the lesson, so it couldn’t be recorded.");
        assertThatThrownBy(() -> record(ava, "06:00", "CHECKED_IN", "noon")).hasMessage("The phone’s time didn’t match the lesson, so it couldn’t be recorded.");
        assertThatThrownBy(() -> record(ava, "06:00", "MAYBE", "2026-11-16T12:02:00Z")).hasMessage("Choose Present or No-show.");
    }

    @Test
    void aLessonThatWasCancelledHasNothingToRecord() {
        assertThatThrownBy(() -> record(ava, "07:00", "NO_SHOW", "2026-11-16T12:40:00Z"))
                .hasMessage("This lesson was cancelled, so there’s nothing to record.");
    }

    @Test
    void theLessonsPageListsLessonsThatStartedAndCorrectsThem() {
        record(ava, "06:00", "CHECKED_IN", "2026-11-16T12:02:00Z");
        List<AttendanceService.PastLesson> past = service.lessons(dana, MONDAY, MONDAY);
        assertThat(past).extracting(p -> p.startTime() + " " + p.skater().fullName() + " " + p.skater().status())
                .containsExactly("06:00 Ava Park CHECKED_IN", "06:30 Jack Park BOOKED");

        assertThat(service.correct(dana, MONDAY, LocalTime.of(6, 0), ava, "NO_SHOW").status()).isEqualTo(Attendance.Shown.NO_SHOW);
        now.set(Instant.parse("2026-11-16T14:00:00Z"));
        assertThat(service.lessons(dana, MONDAY, MONDAY)).extracting(p -> p.skater().status())
                .containsExactly(Attendance.Shown.NO_SHOW, Attendance.Shown.NOT_RECORDED, Attendance.Shown.NOT_RECORDED);
    }

    @Test
    void aLessonThatHasntStartedCantBeCorrectedAndRangesAreChecked() {
        assertThatThrownBy(() -> service.correct(dana, MONDAY, LocalTime.of(7, 30), ava, "CHECKED_IN")).hasMessage("That lesson hasn’t happened yet.");
        assertThatThrownBy(() -> service.lessons(dana, MONDAY, MONDAY.minusDays(1))).hasMessage("The end date is before the start date.");
        assertThatThrownBy(() -> service.lessons(dana, MONDAY, MONDAY.plusDays(366))).hasMessage("Pick up to a year at a time.");
    }

    @Test
    void contactDetailsComeFromTheCoachsOwnRecord() {
        AttendanceService.Contact c = service.contact(dana, ava);
        assertThat(c.clientName()).isEqualTo("Sarah Park");
        assertThat(c.email()).isEqualTo("sarah@example.com");
        assertThat(c.studentName()).isEqualTo("Ava Park");
        assertThatThrownBy(() -> service.contact(dana, "nobody")).hasMessage("That skater couldn’t be found.");
    }

    @Test
    void aCheckedInLessonIsNeverCancelledByTheCoach() {
        record(ava, "06:00", "CHECKED_IN", "2026-11-16T12:02:00Z");
        now.set(Instant.parse("2026-11-16T11:30:00Z")); // before 6:00, as if the phone recorded early
        assertThat(service.today(dana).lessons().get(0).time().lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        assertThatThrownBy(() -> cancels.cancel(dana, CoachCancelRequest.parse("LESSON",
                List.of(new CoachCancelRequest.PickInput(MONDAY.toString(), "06:00", "RELEASE")), null))).isInstanceOf(DomainException.class);
    }

    @Test
    void aSavedCheckInOnALessonTheFamilyCancelledSaysWhenTheyCancelled() {
        now.set(Instant.parse("2026-11-16T13:20:00Z")); // Monday 7:20 AM: the family cancels the 7:30
        familyCancels.cancel(park, dana.coachId(), ava, MONDAY, LocalTime.of(7, 30));
        now.set(Instant.parse("2026-11-16T14:00:00Z"));
        assertThatThrownBy(() -> record(ava, "07:30", "NO_SHOW", "2026-11-16T13:45:00Z"))
                .hasMessage("This lesson was cancelled by the family at 7:20 AM, after you recorded it.");
    }
}
