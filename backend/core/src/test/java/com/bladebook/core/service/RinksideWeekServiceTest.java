package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.CoachCancelRequest.PickInput;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.service.RinksideWeekService.RinkWeek;
import com.bladebook.core.service.RinksideWeekService.WeekDay;
import com.bladebook.core.service.RinksideWeekService.WeekLesson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The rinkside Week tab (Batch 23, G-28; ADR-MASTER section 10 "From the rinkside page"; ADR-009 d5a): the lessons
 * left this week that can still be cancelled, the open times *Cancel rest of week* would hold, and the tab's three
 * cancels: one lesson, a whole day, or the rest of the week (owner, 2026-11-16).
 */
class RinksideWeekServiceTest {

    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate SUNDAY = LocalDate.of(2026, 11, 15);
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalDate WEDNESDAY = LocalDate.of(2026, 11, 18);
    /** Monday, 6:40 AM in Chicago: the 6:00 and 6:30 have started, the 7:00 and 7:30 haven't. */
    private static final Instant MONDAY_640 = Instant.parse("2026-11-16T12:40:00Z");
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private FamilyTestSupport t;
    private Clock clock;
    private RinksideWeekService service;
    private CoachCancelService cancels;
    private CancellationRepository cancelRepo;
    private ScheduleRepository scheduleRepo;
    private BookingService booking;
    private AccessContext dana;
    private ClientContext park;
    private ClientContext rossi;
    private String ava;
    private String jack;
    private String mia;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        scheduleRepo = new ScheduleRepository(t.f.clients, t.f.table);
        cancelRepo = new CancellationRepository(t.f.clients, t.f.table);
        service = new RinksideWeekService(scheduleRepo, t.coaches, t.studentRepo, clock);
        cancels = new CoachCancelService(scheduleRepo, cancelRepo, clock);
        booking = new BookingService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), t.families, clock);

        dana = t.coach("Dana", DANA_CODE);
        // Monday and Wednesday mornings, 6:00–8:00, 30 minutes, $50.
        new ScheduleService(scheduleRepo, t.coaches).save(dana, 0, List.of(new BlockTemplate(1, "Morning ice", LocalTime.of(6, 0),
                LocalTime.of(8, 0), 30, 5000, 1, IceType.BFSC_FREESTYLE, EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY), Map.of())));
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
        book(park, ava, MONDAY, "06:00");
        book(park, jack, MONDAY, "06:30");
        book(rossi, mia, MONDAY, "07:00");
        book(park, ava, WEDNESDAY, "06:00");
        book(rossi, mia, WEDNESDAY, "07:30");
        now.set(MONDAY_640);
    }

    private String id(ClientContext family, String name) {
        return t.familyService.view(family).skaters().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow().studentId();
    }

    private void book(ClientContext family, String studentId, LocalDate date, String time) {
        booking.book(family, BookingRequest.parse(dana.coachId(), studentId, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(date.toString(), time))));
    }

    private static WeekDay day(RinkWeek w, LocalDate date) {
        return w.days().stream().filter(d -> d.date().equals(date)).findFirst().orElseThrow();
    }

    private LessonTime.Status status(LocalDate date, String time) {
        return scheduleRepo.lessonTimes(dana, date, date).stream().filter(l -> l.startTime().equals(LocalTime.parse(time)))
                .findFirst().orElseThrow().lessonStatus();
    }

    @Test
    void theWeekRunsFromTodayToSaturdayInTheCoachsTimeZone() {
        RinkWeek w = service.week(dana);

        assertThat(w.coachTimezone()).isEqualTo("America/Chicago");
        assertThat(w.today()).isEqualTo(MONDAY);
        assertThat(w.now()).isEqualTo(LocalTime.of(6, 40));
        assertThat(w.weekStart()).isEqualTo(SUNDAY);
        assertThat(w.days()).extracting(WeekDay::date).containsExactly(MONDAY, MONDAY.plusDays(1), WEDNESDAY,
                MONDAY.plusDays(3), MONDAY.plusDays(4), MONDAY.plusDays(5));
    }

    @Test
    void todayListsOnlyLessonsNotStartedAndCountsTheStartedOnes() {
        WeekDay monday = day(service.week(dana), MONDAY);

        assertThat(monday.lessons()).extracting(WeekLesson::startTime).containsExactly(LocalTime.of(7, 0));
        WeekLesson seven = monday.lessons().get(0);
        assertThat(seven.durationMinutes()).isEqualTo(30);
        assertThat(seven.skaters()).singleElement().satisfies(s -> {
            assertThat(s.studentId()).isEqualTo(mia);
            assertThat(s.shortName()).isEqualTo("Mia R.");
            assertThat(s.familyName()).isNotBlank();
        });
        assertThat(monday.started()).isEqualTo(2);                       // Ava's 6:00 and Jack's 6:30
        assertThat(monday.open()).extracting(RinksideWeekService.OpenTime::startTime).containsExactly(LocalTime.of(7, 30));
    }

    @Test
    void laterDaysListEveryBookedLessonAndEveryOpenTime() {
        RinkWeek w = service.week(dana);
        WeekDay wednesday = day(w, WEDNESDAY);

        assertThat(wednesday.lessons()).extracting(WeekLesson::startTime).containsExactly(LocalTime.of(6, 0), LocalTime.of(7, 30));
        assertThat(wednesday.started()).isZero();
        assertThat(wednesday.open()).extracting(RinksideWeekService.OpenTime::startTime).containsExactly(LocalTime.of(6, 30), LocalTime.of(7, 0));
        WeekDay tuesday = day(w, MONDAY.plusDays(1));
        assertThat(tuesday.lessons()).isEmpty();
        assertThat(tuesday.open()).isEmpty();
        assertThat(tuesday.started()).isZero();
    }

    @Test
    void twoSkatersFromOneFamilyShareTheFamilysId() {
        book(park, jack, WEDNESDAY, "07:00");
        WeekDay wednesday = day(service.week(dana), WEDNESDAY);

        String avaFamily = wednesday.lessons().get(0).skaters().get(0).familyId();
        String jackFamily = wednesday.lessons().stream().filter(l -> l.startTime().equals(LocalTime.of(7, 0))).findFirst().orElseThrow()
                .skaters().get(0).familyId();
        assertThat(avaFamily).isEqualTo(jackFamily).isNotBlank();
    }

    @Test
    void aLessonAlreadyMarkedCantBeCancelledSoItCountsAsStarted() {
        // Mia checked in early for her 7:00 (allowed from an hour before).
        new AttendanceService(new AttendanceRepository(t.f.clients, t.f.table), scheduleRepo, t.studentRepo, t.coaches, clock)
                .record(dana, MONDAY, LocalTime.of(7, 0), mia, "CHECKED_IN", MONDAY_640.toString());

        WeekDay monday = day(service.week(dana), MONDAY);
        assertThat(monday.lessons()).isEmpty();
        assertThat(monday.started()).isEqualTo(3);
    }

    @Test
    void aHeldTimeIsNeitherALessonNorAnOpenTime() {
        cancels.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(new PickInput(WEDNESDAY.toString(), "06:00", "HOLD")), null));

        WeekDay wednesday = day(service.week(dana), WEDNESDAY);
        assertThat(wednesday.lessons()).extracting(WeekLesson::startTime).containsExactly(LocalTime.of(7, 30));
        assertThat(wednesday.open()).extracting(RinksideWeekService.OpenTime::startTime).doesNotContain(LocalTime.of(6, 0));
    }

    @Test
    void onSaturdayTheWeekIsJustToday() {
        now.set(Instant.parse("2026-11-21T15:00:00Z"));
        assertThat(service.week(dana).days()).extracting(WeekDay::date).containsExactly(LocalDate.of(2026, 11, 21));
    }

    @Test
    void onSundayTheWeekIsAllSevenDays() {
        now.set(Instant.parse("2026-11-15T15:00:00Z"));
        RinkWeek w = service.week(dana);
        assertThat(w.weekStart()).isEqualTo(SUNDAY);
        assertThat(w.days()).hasSize(7);
    }

    @Test
    void aCoachWithoutAProfileIsToldToFinishSettingUp() {
        assertThatThrownBy(() -> service.week(new AccessContext("no-such-coach")))
                .isInstanceOf(DomainException.class);
    }

    // ------------------------------------------- cancelling from the Week tab

    @Test
    void oneLessonFromTheWeekIsALessonBatch() {
        CoachCancelService.Result r = cancels.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(
                new PickInput(WEDNESDAY.toString(), "07:30", "HOLD")), null));

        assertThat(r).isEqualTo(new CoachCancelService.Result(1, 1, 0, 1, 0));
        assertThat(status(WEDNESDAY, "07:30")).isEqualTo(LessonTime.Status.HELD);
        assertThat(cancelRepo.batches(dana)).singleElement().satisfies(b -> {
            assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.LESSON);
            assertThat(b.cancelledBy()).isEqualTo(ChangeBatch.By.COACH);
        });
        assertThat(day(service.week(dana), WEDNESDAY).lessons()).extracting(WeekLesson::startTime).containsExactly(LocalTime.of(6, 0));
    }

    @Test
    void aWholeDayIsOneDayBatchWithEachLessonsOwnChoice() {
        WeekDay wednesday = day(service.week(dana), WEDNESDAY);
        CoachCancelService.Result r = cancels.cancel(dana, CoachCancelRequest.parse("DAY", wednesday.lessons().stream()
                .map(l -> new PickInput(l.date().toString(), l.startTime().toString(), l.startTime().equals(LocalTime.of(6, 0)) ? "HOLD" : "RELEASE"))
                .toList(), null));

        assertThat(r).isEqualTo(new CoachCancelService.Result(2, 1, 0, 2, 0));
        assertThat(status(WEDNESDAY, "06:00")).isEqualTo(LessonTime.Status.HELD);
        assertThat(status(WEDNESDAY, "07:30")).isEqualTo(LessonTime.Status.OPEN);
        assertThat(cancelRepo.batches(dana)).singleElement().satisfies(b -> {
            assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.DAY);
            assertThat(b.affectedFrom()).isEqualTo(WEDNESDAY);
            assertThat(b.affectedTo()).isEqualTo(WEDNESDAY);
            assertThat(b.lessonCount()).isEqualTo(2);
            assertThat(b.clientCount()).isEqualTo(2);
        });
    }

    @Test
    void todaysWholeDayLeavesALessonThatStartedMeanwhileAndCountsIt() {
        CoachCancelService.Result r = cancels.cancel(dana, CoachCancelRequest.parse("DAY", List.of(
                new PickInput(MONDAY.toString(), "06:30", "HOLD"),
                new PickInput(MONDAY.toString(), "07:00", "HOLD")), null));

        assertThat(r.cancelled()).isEqualTo(1);
        assertThat(r.skipped()).isEqualTo(1);
        assertThat(status(MONDAY, "06:30")).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void afterCancelRestOfWeekTheTabHasNothingLeftToCancel() {
        RinkWeek before = service.week(dana);
        int lessons = before.days().stream().mapToInt(d -> d.lessons().size()).sum();
        int open = before.days().stream().mapToInt(d -> d.open().size()).sum();

        CoachCancelService.Result r = cancels.cancel(dana, CoachCancelRequest.parse("WEEK", null, before.weekStart().toString()));

        // What the tab showed is exactly what the whole-week cancel closed (S8).
        assertThat(r.cancelled()).isEqualTo(lessons);
        assertThat(r.held()).isEqualTo(lessons);
        assertThat(r.openHeld()).isEqualTo(open);
        RinkWeek after = service.week(dana);
        assertThat(after.days()).allSatisfy(d -> {
            assertThat(d.lessons()).isEmpty();
            assertThat(d.open()).isEmpty();
        });
        assertThat(day(after, MONDAY).started()).isEqualTo(2);
    }
}
