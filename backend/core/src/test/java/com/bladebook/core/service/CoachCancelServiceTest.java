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
import com.bladebook.core.domain.TempSchedule;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
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
        service = new CoachCancelService(scheduleRepo, cancelRepo, new ScheduleChangeService(scheduleRepo, t.coaches, clock), t.coaches, clock);

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
    void nothingLeftToCancelIsRefused() {
        assertThatThrownBy(() -> service.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(pick("07:30", "HOLD")), null)))
                .isInstanceOf(DomainException.class).hasMessage("These lessons have already started or were cancelled.");
        assertThat(cancelRepo.batches(dana)).isEmpty();
    }

    @Test
    void cancellingNeverChangesTheWeeklySchedule() {
        var before = new ScheduleService(scheduleRepo, t.coaches).schedule(dana);
        service.cancel(dana, CoachCancelRequest.parse("WEEK", null, SUNDAY.toString()));
        assertThat(new ScheduleService(scheduleRepo, t.coaches).schedule(dana)).isEqualTo(before);
    }

    // ------------------------------------------- a lesson that changed between the read and the write

    @AfterEach
    void noRacesLeft() {
        WriteRaces.clear();
    }

    /** Sets the lesson's stored seat count, so a write planned from the earlier read fails its check. */
    private Runnable seatsTaken(String time, int n) {
        return () -> t.f.clients.forSetup().updateItem(b -> b.tableName(t.f.table)
                .key(java.util.Map.of("PK", AttributeValue.fromS("COACH#" + dana.coachId()),
                        "SK", AttributeValue.fromS(LessonTime.key(MONDAY, LocalTime.parse(time)))))
                .updateExpression("SET seatsTaken = :n")
                .expressionAttributeValues(java.util.Map.of(":n", AttributeValue.fromN(Integer.toString(n)))));
    }

    @Test
    void oneLessonThatChangedSinceItWasReadIsReadAgainAndCancelled() {
        WriteRaces.beforeNextWrites(seatsTaken("06:00", 5), seatsTaken("06:00", 1));

        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(pick("06:00", "HOLD")), null));

        assertThat(r).isEqualTo(new CoachCancelService.Result(1, 1, 0, 1, 0));
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.HELD);
        assertThat(cancelRepo.lines(dana)).extracting(CancellationLine::studentId).containsExactly(ava);
    }

    @Test
    void oneLessonThatStillCantBeWrittenAfterReadingAgainIsRefused() {
        WriteRaces.beforeNextWrites(seatsTaken("06:00", 5), WriteRaces.NOTHING);

        assertThatThrownBy(() -> service.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(pick("06:00", "HOLD")), null)))
                .isInstanceOf(DomainException.class).hasMessage("These lessons have already started or were cancelled.");
        assertThat(cancelRepo.batches(dana)).isEmpty();
    }


    // ---------------------------------------------------------------- a day or the week is time off (I24)

    private static PickInput dayPick(String time) {
        return new PickInput(MONDAY.toString(), time, null);
    }

    private List<TempSchedule> temps() {
        return scheduleRepo.temps(dana);
    }

    @Test
    void aDayIsTimeOffCalledCancelledAndItsLessonsAreCancelledAsTheCoachs() {
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("DAY",
                List.of(dayPick("06:00"), dayPick("06:30"), dayPick("07:00")), null));

        assertThat(r).isEqualTo(new CoachCancelService.Result(3, 0, 0, 2, 0));
        assertThat(temps()).singleElement().satisfies(t -> {
            assertThat(t.kind()).isEqualTo(TempSchedule.Kind.TIME_OFF);
            assertThat(t.name()).isEqualTo("Cancelled");
            assertThat(t.startDate()).isEqualTo(MONDAY);
            assertThat(t.endDate()).isEqualTo(MONDAY);
        });
        // No release-or-hold: the times leave the booking page, as for any time off.
        assertThat(scheduleRepo.lessonTimes(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(scheduleRepo.seats(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(cancelRepo.lines(dana)).hasSize(3).allSatisfy(l -> assertThat(l.cancelledBy()).isEqualTo(ChangeBatch.By.COACH));
        ChangeBatch b = cancelRepo.batches(dana).get(0);
        assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.DAY);
        assertThat(b.cancelledBy()).isEqualTo(ChangeBatch.By.COACH);
        assertThat(b.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(b.clientCount()).isEqualTo(2);
    }

    @Test
    void aDayFromNowOnLeavesLessonsThatHaveStarted() {
        now.set(Instant.parse("2026-11-16T12:15:00Z")); // Monday 6:15 AM: the 6:00 has started
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("DAY",
                List.of(dayPick("06:00"), dayPick("06:30"), dayPick("07:00")), null));
        assertThat(r.cancelled()).isEqualTo(2);
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.BOOKED); // attendance and payment stay
        assertThat(scheduleRepo.seats(dana, MONDAY, MONDAY)).extracting(s -> s.studentId()).containsExactly(ava);
    }

    @Test
    void theRestOfTheWeekIsTimeOffFromTodayToSaturday() {
        now.set(Instant.parse("2026-11-16T12:45:00Z")); // Monday 6:45 AM: 6:00 and 6:30 have started
        CoachCancelService.Result r = service.cancel(dana, CoachCancelRequest.parse("WEEK", null, SUNDAY.toString()));

        assertThat(r).isEqualTo(new CoachCancelService.Result(1, 0, 0, 1, 0)); // Mia's 7:00
        assertThat(temps()).singleElement().satisfies(t -> {
            assertThat(t.startDate()).isEqualTo(MONDAY); // from today, not Sunday
            assertThat(t.endDate()).isEqualTo(SUNDAY.plusDays(6));
        });
        assertThat(status("06:00")).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(status("06:30")).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(cancelRepo.batches(dana).get(0).batchSource()).isEqualTo(ChangeBatch.Source.WEEK);
    }

    @Test
    void aDayInsideASpecialScheduleSwitchesItsTimesOffAndKeepsTheRest() {
        TempSchedule camp = new TempSchedule(UUID.randomUUID().toString(), TempSchedule.Kind.SPECIAL, "Camp", MONDAY,
                MONDAY.plusDays(1), List.of(mondayMornings(5000)), java.util.Map.of());
        scheduleRepo.saveTemp(dana, camp, null);
        new ScheduleChangeService(scheduleRepo, t.coaches, Clock.fixed(now.get(), ZoneOffset.UTC)).apply(dana);
        LocalDate tuesday = MONDAY.plusDays(1);
        assertThat(scheduleRepo.lessonTimes(dana, tuesday, tuesday)).isNotEmpty();

        service.cancel(dana, CoachCancelRequest.parse("DAY", List.of(dayPick("06:00")), null));

        assertThat(temps()).singleElement().satisfies(t -> { // no new time off: the camp is edited
            assertThat(t.tempId()).isEqualTo(camp.tempId());
            assertThat(t.endDate()).isEqualTo(tuesday);
            assertThat(t.off().get(1).get(MONDAY)).hasSize(4); // 6:00 to 7:30
        });
        assertThat(scheduleRepo.lessonTimes(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(scheduleRepo.lessonTimes(dana, tuesday, tuesday)).hasSize(4); // the rest of the camp stays
    }

    /** What the stream record of a date item shows the consumer: who applies it. */
    private String appliedBy(LocalDate d) {
        java.util.Map<String, AttributeValue> m = t.f.clients.forSetup().getItem(g -> g.tableName(t.f.table).key(java.util.Map.of(
                "PK", AttributeValue.fromS("COACH#" + dana.coachId()), "SK", AttributeValue.fromS("SCHEDULE#DATE#" + d)))).item();
        return m.containsKey("appliedBy") ? m.get("appliedBy").s() : null;
    }

    @Test
    void theDatesACancelWritesAreMarkedSoOnlyItsOwnApplyCancelsTheirLessons() {
        service.cancel(dana, CoachCancelRequest.parse("DAY", List.of(dayPick("06:00")), null));
        // consumer-schedule-change skips these: the coach's own apply cancels the lessons, as the coach's (I24).
        assertThat(appliedBy(MONDAY)).isEqualTo("COACH");
    }

    @Test
    void cancellingADayInsideASpecialScheduleNeverLeavesItsDatesMissingPartWay() {
        LocalDate tuesday = MONDAY.plusDays(1);
        TempSchedule camp = new TempSchedule(UUID.randomUUID().toString(), TempSchedule.Kind.SPECIAL, "Camp", MONDAY,
                tuesday, List.of(mondayMornings(5000)), java.util.Map.of());
        scheduleRepo.saveTemp(dana, camp, null);
        new ScheduleChangeService(scheduleRepo, t.coaches, Clock.fixed(now.get(), ZoneOffset.UTC)).apply(dana);
        assertThat(appliedBy(tuesday)).isNull();
        // As consumer-schedule-change would see the dates while the camp is rewritten: never the weekly schedule instead.
        List<java.util.Set<LocalDate>> seenDates = new java.util.ArrayList<>();
        WriteRaces.beforeNextWrites(() -> seenDates.add(scheduleRepo.overrides(dana, MONDAY, tuesday).keySet()));

        service.cancel(dana, CoachCancelRequest.parse("DAY", List.of(dayPick("06:00")), null));

        assertThat(seenDates).containsExactly(java.util.Set.of(MONDAY, tuesday));
        assertThat(appliedBy(MONDAY)).isEqualTo("COACH");
        assertThat(appliedBy(tuesday)).isEqualTo("COACH");
    }

    @Test
    void aDayAlreadyOffOrAlreadyOverHasNothingToCancel() {
        service.cancel(dana, CoachCancelRequest.parse("DAY", List.of(dayPick("06:00")), null));
        assertThatThrownBy(() -> service.cancel(dana, CoachCancelRequest.parse("DAY", List.of(dayPick("06:00")), null)))
                .isInstanceOf(DomainException.class);
        now.set(Instant.parse("2026-11-18T15:00:00Z")); // Wednesday
        assertThatThrownBy(() -> service.cancel(dana, CoachCancelRequest.parse("DAY", List.of(dayPick("06:30")), null)))
                .isInstanceOf(DomainException.class);
        assertThat(temps()).hasSize(1);
    }
}
