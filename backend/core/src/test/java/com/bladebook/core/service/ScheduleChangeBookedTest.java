package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ChangeBatchRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.PriceChange;
import com.bladebook.core.domain.RepriceLine;
import com.bladebook.core.domain.TempSchedule;
import com.bladebook.core.domain.Seat;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A schedule change that reaches booked lessons (ADR-MASTER section 9; FeatureDecriptions/Re-pricing Booked
 * Lessons.md): the preview lists them, and the save cancels or re-prices them through a change batch.
 */
class ScheduleChangeBookedTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalDate NEXT_MONDAY = MONDAY.plusDays(7);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(BOOKED_AT);
    private FamilyTestSupport t;
    private ScheduleRepository repo;
    private ScheduleService schedules;
    private ScheduleChangeService change;
    private TempScheduleService temps;
    private ChangeBatchRepository batches;
    private CancellationRepository cancels;
    private BookingService booking;
    private AccessContext dana;
    private ClientContext park;
    private ClientContext rossi;
    private CancellationService familyCancel;
    private String ava;
    private String mia;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        repo = new ScheduleRepository(t.f.clients, t.f.table);
        schedules = new ScheduleService(repo, t.coaches);
        change = new ScheduleChangeService(repo, t.coaches, clock);
        temps = new TempScheduleService(repo, t.coaches, change, clock);
        batches = repo.changeBatches();
        cancels = new CancellationRepository(t.f.clients, t.f.table);
        booking = new BookingService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), t.families, clock);
        familyCancel = new CancellationService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table), cancels, clock);

        dana = t.coach("Dana", DANA_CODE);
        schedules.save(dana, 0, List.of(mondayMornings(5000)));
        change.apply(dana);

        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE), FamilyTestSupport.kid("Ava Park", DANA_CODE)));
        rossi = FamilyTestSupport.newFamily();
        t.registration.register(rossi, "gina@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE), FamilyTestSupport.kid("Mia Rossi", DANA_CODE)));
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        ava = t.familyService.view(park).skaters().get(0).studentId();
        mia = t.familyService.view(rossi).skaters().get(0).studentId();
        book(park, ava, MONDAY, "06:00");
        book(rossi, mia, MONDAY, "07:00");
        book(park, ava, NEXT_MONDAY, "06:00");
    }

    @AfterEach
    void noRacesLeft() {
        WriteRaces.clear();
    }

    private void book(ClientContext family, String studentId, LocalDate d, String time) {
        booking.book(family, BookingRequest.parse(dana.coachId(), studentId, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(d.toString(), time))));
    }

    private LessonTime at(LocalDate d, String time) {
        return repo.lessonTimes(dana, d, d).stream().filter(l -> l.startTime().equals(LocalTime.parse(time))).findFirst().orElse(null);
    }

    /** Monday mornings, but only 6:00 to 7:00 now: the 7:00 and 7:30 are dropped. */
    private static BlockTemplate shorter(int price) {
        return new BlockTemplate(1, "Morning ice", LocalTime.of(6, 0), LocalTime.of(7, 0), 30, price, 1, IceType.BFSC_FREESTYLE,
                EnumSet.of(DayOfWeek.MONDAY), Map.of());
    }

    @Test
    void theWeeklyPreviewListsWhatItCancelsAndReprices() {
        ScheduleChangeService.Preview p = change.previewWeekly(dana, List.of(shorter(6000)));

        assertThat(p.cancel()).extracting(i -> i.date() + " " + i.startTime()).contains("2026-11-16 07:00");
        assertThat(p.cancel()).allSatisfy(i -> assertThat(i.skaters()).extracting(ScheduleChangeService.Who::name).containsExactly("Mia R."));
        assertThat(p.reprice()).extracting(i -> i.date() + " " + i.startTime() + " " + i.newPriceMinor())
                .containsExactly("2026-11-16 06:00 6000", "2026-11-23 06:00 6000");
        assertThat(p.kept()).isEmpty();
        assertThat(p.families()).isEqualTo(2);
        assertThat(p.big()).isEmpty();
        // Nothing is written by a preview.
        assertThat(at(MONDAY, "07:00").lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void anIncreaseInsideTheNoticePeriodIsListedAsKeptAndABigCutWarns() {
        now.set(Instant.parse("2026-11-15T13:00:00Z")); // Sunday 7 AM: Monday's 6:00 is 23 hours away
        ScheduleChangeService.Preview up = change.previewWeekly(dana, List.of(mondayMornings(6000)));
        assertThat(up.kept()).extracting(i -> i.date().toString()).containsExactly("2026-11-16", "2026-11-16");
        assertThat(up.reprice()).extracting(i -> i.date().toString()).containsExactly("2026-11-23");

        ScheduleChangeService.Preview cut = change.previewWeekly(dana, List.of(mondayMornings(500)));
        assertThat(cut.big()).containsExactly(new PriceChange(1, "Morning ice", 5000, 500));
        assertThat(cut.reprice()).hasSize(3);
    }

    @Test
    void savingCancelsAndRepricesThroughAPlannedBatch() {
        now.set(Instant.parse("2026-11-11T15:00:00Z"));
        schedules.save(dana, 1, List.of(shorter(6000)));
        ScheduleChangeService.Result r = change.apply(dana);

        assertThat(r.cancelled()).isEqualTo(1);
        assertThat(r.repriced()).isEqualTo(2);
        assertThat(r.families()).isEqualTo(2);
        assertThat(at(MONDAY, "07:00")).isNull();
        assertThat(at(MONDAY, "06:00").priceMinor()).isEqualTo(6000);
        assertThat(at(MONDAY, "06:00").lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(repo.seats(dana, MONDAY, MONDAY)).extracting(s -> s.studentId()).containsExactly(ava);

        ChangeBatch b = cancels.batches(dana).get(0);
        assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.DEFAULT);
        assertThat(b.cancelledBy()).isEqualTo(ChangeBatch.By.SCHEDULE_CHANGE);
        assertThat(b.executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(b.lessonCount()).isEqualTo(3);
        assertThat(b.clientCount()).isEqualTo(2);
        assertThat(b.affectedFrom()).isEqualTo(MONDAY);
        assertThat(b.affectedTo()).isEqualTo(NEXT_MONDAY);   // the furthest re-priced lesson
        assertThat(cancels.lines(dana)).extracting(CancellationLine::studentId, CancellationLine::executionStatus)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(mia, ChangeBatch.Execution.EXECUTED));
        assertThat(batches.reprices(dana)).extracting(RepriceLine::oldPriceMinor, RepriceLine::newPriceMinor, RepriceLine::executionStatus)
                .containsOnly(org.assertj.core.groups.Tuple.tuple(5000, 6000, ChangeBatch.Execution.EXECUTED));
        assertThat(change.status(dana)).hasValueSatisfying(s -> {
            assertThat(s.batch().executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
            assertThat(s.stuck()).isFalse();
        });

        // Run again: nothing left to change.
        ScheduleChangeService.Result again = change.apply(dana);
        assertThat(again.cancelled() + again.repriced()).isZero();
        assertThat(cancels.batches(dana)).hasSize(1);
    }

    @Test
    void aSaveWithNoBookingsTouchedWritesNoBatch() {
        schedules.save(dana, 1, List.of(mondayMornings(5000), ScheduleTestSupport.days(2, EnumSet.of(DayOfWeek.TUESDAY), 9, 10)));
        change.apply(dana);
        assertThat(cancels.batches(dana)).isEmpty();
        assertThat(change.status(dana)).isEmpty();
    }

    @Test
    void aNewLengthAtTheSameStartCancelsTheBookingAndOpensTheNewTime() {
        schedules.save(dana, 1, List.of(new BlockTemplate(1, "Morning ice", LocalTime.of(6, 0), LocalTime.of(8, 0), 60, 5000, 1,
                IceType.BFSC_FREESTYLE, EnumSet.of(DayOfWeek.MONDAY), Map.of())));
        change.apply(dana);
        LessonTime six = at(MONDAY, "06:00");
        assertThat(six.lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(six.durationMinutes()).isEqualTo(60);
        assertThat(repo.seats(dana, MONDAY, MONDAY)).isEmpty();
    }

    // ------------------------------------------------------------- dated schedules

    private static TempSchedule timeOff(String id, LocalDate from, LocalDate to) {
        return new TempSchedule(id, TempSchedule.Kind.TIME_OFF, "Thanksgiving", from, to, List.of(), Map.of());
    }

    @Test
    void timeOffPreviewsItsOwnDatesThenCancelsThemAndTheTimesStopExisting() {
        TempSchedule off = timeOff(null, MONDAY, MONDAY);
        ScheduleChangeService.Preview p = temps.preview(dana, off);
        assertThat(p.cancel()).extracting(i -> i.startTime().toString()).containsExactly("06:00", "07:00");
        assertThat(p.reprice()).isEmpty();
        assertThat(p.families()).isEqualTo(2);

        TempSchedule saved = temps.save(dana, off);
        ScheduleChangeService.Result r = change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);

        assertThat(r.cancelled()).isEqualTo(2);
        assertThat(repo.lessonTimes(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(at(NEXT_MONDAY, "06:00").lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(cancels.batches(dana).get(0).batchSource()).isEqualTo(ChangeBatch.Source.DATE_OVERRIDE);
        assertThat(temps.upcoming(dana)).extracting(TempSchedule::tempId).containsExactly(saved.tempId());
        assertThat(repo.overrides(dana, MONDAY, MONDAY)).containsEntry(MONDAY, List.of());
    }

    @Test
    void anOverlappingOneIsRefusedWithTheMessage() {
        temps.save(dana, timeOff(null, MONDAY, MONDAY.plusDays(2)));
        assertThatThrownBy(() -> temps.preview(dana, timeOff(null, MONDAY.plusDays(2), MONDAY.plusDays(3))))
                .hasMessage("These dates overlap Thanksgiving (Nov 16 – 18) on Nov 18. Edit Thanksgiving to change those days, or choose dates outside it.");
    }

    @Test
    void aSpecialScheduleReplacesTheWeekOnItsDatesAndEditingItReplacesEveryDate() {
        BlockTemplate camp = new BlockTemplate(1, "Camp ice", LocalTime.of(9, 0), LocalTime.of(11, 0), 60, 8000, 1, IceType.BFSC_FREESTYLE,
                Set.of(), Map.of());
        TempSchedule special = new TempSchedule(null, TempSchedule.Kind.SPECIAL, "Camp", NEXT_MONDAY, NEXT_MONDAY.plusDays(1),
                List.of(camp), Map.of(1, Map.of(NEXT_MONDAY.plusDays(1), Set.of(LocalTime.of(10, 0)))));
        assertThat(temps.preview(dana, special).cancel()).extracting(i -> i.date().toString()).containsExactly("2026-11-23");

        TempSchedule saved = temps.save(dana, special);
        change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        assertThat(repo.lessonTimes(dana, NEXT_MONDAY, NEXT_MONDAY)).extracting(l -> l.startTime().toString()).containsExactly("09:00", "10:00");
        assertThat(repo.lessonTimes(dana, NEXT_MONDAY.plusDays(1), NEXT_MONDAY.plusDays(1))).extracting(l -> l.startTime().toString()).containsExactly("09:00");
        assertThat(temps.get(dana, saved.tempId())).isEqualTo(saved);

        // Shorter by a day, and dearer: the dropped date goes back to the weekly schedule (no Tuesday lessons).
        TempSchedule edited = new TempSchedule(saved.tempId(), TempSchedule.Kind.SPECIAL, "Camp", NEXT_MONDAY, NEXT_MONDAY,
                List.of(new BlockTemplate(1, "Camp ice", LocalTime.of(9, 0), LocalTime.of(11, 0), 60, 20000, 1, IceType.BFSC_FREESTYLE, Set.of(), Map.of())), Map.of());
        assertThat(temps.preview(dana, edited).big()).containsExactly(new PriceChange(1, "Camp ice", 8000, 20000));
        temps.save(dana, edited);
        change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        assertThat(repo.overrides(dana, NEXT_MONDAY, NEXT_MONDAY.plusDays(1))).containsOnlyKeys(NEXT_MONDAY);
        assertThat(repo.lessonTimes(dana, NEXT_MONDAY.plusDays(1), NEXT_MONDAY.plusDays(1))).isEmpty();
        assertThat(at(NEXT_MONDAY, "09:00").priceMinor()).isEqualTo(20000);
    }

    @Test
    void aWeeklyChangeDoesntReachDatesUnderTimeOff() {
        temps.save(dana, timeOff(null, NEXT_MONDAY, NEXT_MONDAY));
        change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        ScheduleChangeService.Preview p = change.previewWeekly(dana, List.of(shorter(6000)));
        assertThat(p.reprice()).extracting(i -> i.date().toString()).containsExactly("2026-11-16");
    }

    @Test
    void timeOffCantBecomeASpecialSchedule() {
        TempSchedule saved = temps.save(dana, timeOff(null, MONDAY, MONDAY));
        TempSchedule asSpecial = new TempSchedule(saved.tempId(), TempSchedule.Kind.SPECIAL, "", MONDAY, MONDAY, List.of(), Map.of());
        assertThatThrownBy(() -> temps.save(dana, asSpecial)).hasMessage("Time off can’t become a special schedule. Add a new one instead.");
    }

    @Test
    void deletingASpecialSchedulePreviewsItThenPutsTheWeekBackAndCancelsWhatOnlyItMade() {
        BlockTemplate camp = new BlockTemplate(1, "Camp ice", LocalTime.of(9, 0), LocalTime.of(10, 0), 60, 8000, 1, IceType.BFSC_FREESTYLE,
                Set.of(), Map.of());
        TempSchedule saved = temps.save(dana, new TempSchedule(null, TempSchedule.Kind.SPECIAL, "Camp", MONDAY.plusDays(14), MONDAY.plusDays(14),
                List.of(camp), Map.of()));
        change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        book(park, ava, MONDAY.plusDays(14), "09:00");

        ScheduleChangeService.Preview p = temps.previewDelete(dana, saved.tempId());
        assertThat(p.cancel()).extracting(i -> i.date() + " " + i.startTime()).containsExactly("2026-11-30 09:00");
        assertThat(p.families()).isEqualTo(1);

        temps.delete(dana, saved.tempId());
        ScheduleChangeService.Result r = change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        assertThat(r.cancelled()).isEqualTo(1);
        assertThat(temps.upcoming(dana)).isEmpty();
        assertThat(repo.overrides(dana, MONDAY.plusDays(14), MONDAY.plusDays(14))).isEmpty();
        assertThat(repo.lessonTimes(dana, MONDAY.plusDays(14), MONDAY.plusDays(14))).extracting(l -> l.startTime().toString())
                .containsExactly("06:00", "06:30", "07:00", "07:30");
    }

    @Test
    void deletingTimeOffOpensItsDatesAgainAndCancelsNothing() {
        TempSchedule saved = temps.save(dana, timeOff(null, MONDAY.plusDays(14), MONDAY.plusDays(14)));
        change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        assertThat(repo.lessonTimes(dana, MONDAY.plusDays(14), MONDAY.plusDays(14))).isEmpty();
        assertThat(temps.previewDelete(dana, saved.tempId()).cancel()).isEmpty();
        temps.delete(dana, saved.tempId());
        change.apply(dana, ChangeBatch.Source.DATE_OVERRIDE);
        assertThat(repo.lessonTimes(dana, MONDAY.plusDays(14), MONDAY.plusDays(14))).hasSize(4);
        assertThatThrownBy(() -> temps.delete(dana, saved.tempId())).hasMessage("That time off or special schedule couldn’t be found.");
    }

    @Test
    void aBatchThatHasntFinishedAfterAnHourIsReportedStuck() {
        Instant started = now.get();
        batches.begin(dana, new ChangeBatch(UUID.randomUUID().toString(), started, ChangeBatch.Source.DEFAULT,
                ChangeBatch.By.SCHEDULE_CHANGE, dana.coachId(), MONDAY, MONDAY, 1, 1, ChangeBatch.Execution.PLANNED));

        now.set(started.plus(java.time.Duration.ofMinutes(59)));
        assertThat(change.status(dana)).hasValueSatisfying(s -> assertThat(s.stuck()).isFalse());
        now.set(started.plus(java.time.Duration.ofMinutes(61)));
        assertThat(change.status(dana)).hasValueSatisfying(s -> {
            assertThat(s.stuck()).isTrue();
            assertThat(s.batch().executionStatus()).isEqualTo(ChangeBatch.Execution.PLANNED);
        });
    }

    // ------------------------------------------------------------- the drift check and reconcile (section 19)

    @Test
    void theDriftCheckFindsAMissedCancellationAndReconcileCarriesItOut() {
        schedules.save(dana, 1, List.of(shorter(5000))); // saved, but the schedule change never ran
        assertThat(change.drift(dana)).isEqualTo(new ScheduleChangeService.Drift(0, 1, 0)); // Mia's 7:00

        ScheduleChangeService.Reconciled r = change.reconcile(dana);

        assertThat(r.settled()).isZero();
        assertThat(r.result().cancelled()).isEqualTo(1);
        assertThat(cancels.batches(dana)).last().satisfies(b -> assertThat(b.batchSource()).isEqualTo(ChangeBatch.Source.RECONCILE));
        assertThat(change.drift(dana).clean()).isTrue();
        assertThat(change.reconcile(dana).result().cancelled()).isZero(); // safe to run again
    }

    @Test
    void aStuckBatchIsSettledWithWhatWasDoneAndItsRemainingLinesSkipped() {
        schedules.save(dana, 1, List.of(shorter(5000)));
        change.apply(dana);
        ChangeBatch b = cancels.batches(dana).get(0);
        CancellationLine line = cancels.lines(dana).get(0);
        // As if it stopped part-way: the header never reached EXECUTED and a line is still PLANNED.
        for (String sk : List.of(b.key(), line.key())) {
            t.f.clients.forSetup().updateItem(u -> u.tableName(t.f.table).key(Map.of("PK", AttributeValue.fromS(dana.partitionKey()),
                    "SK", AttributeValue.fromS(sk))).updateExpression("SET executionStatus = :p")
                    .expressionAttributeValues(Map.of(":p", AttributeValue.fromS("PLANNED"))));
        }
        assertThat(change.drift(dana).stuckBatches()).isZero(); // under an hour: still running
        now.set(now.get().plus(Duration.ofHours(2)));
        assertThat(change.drift(dana).stuckBatches()).isEqualTo(1);

        assertThat(change.reconcile(dana).settled()).isEqualTo(1);

        assertThat(cancels.batches(dana).get(0).executionStatus()).isEqualTo(ChangeBatch.Execution.EXECUTED);
        assertThat(cancels.lines(dana).get(0).executionStatus()).isEqualTo(ChangeBatch.Execution.SKIPPED);
        assertThat(change.drift(dana).stuckBatches()).isZero();
    }

    // ------------------------------------------------------------- races between reading and writing

    private void setSeat(LocalDate d, String time, String studentId, Seat.Status status) {
        t.f.clients.forSetup().updateItem(u -> u.tableName(t.f.table).key(Map.of("PK", AttributeValue.fromS(dana.partitionKey()),
                "SK", AttributeValue.fromS(Seat.key(d, LocalTime.parse(time), studentId)))).updateExpression("SET seatStatus = :s")
                .expressionAttributeValues(Map.of(":s", AttributeValue.fromS(status.name()))));
    }

    /** Runs {@code race} once, before the first write after the change batch's header exists: the first lesson carried out. */
    private void beforeTheFirstBatchWrite(Runnable race) {
        java.util.concurrent.atomic.AtomicBoolean ran = new java.util.concurrent.atomic.AtomicBoolean();
        Runnable step = () -> {
            if (!ran.get() && !cancels.batches(dana).isEmpty()) {
                ran.set(true);
                race.run();
            }
        };
        WriteRaces.beforeNextWrites(java.util.Collections.nCopies(20, step).toArray(Runnable[]::new));
    }

    @Test
    void aScheduleChangeNeverCancelsALessonSomeoneIsCheckedInTo() {
        now.set(Instant.parse("2026-11-16T12:15:00Z")); // Monday 6:15 AM: Mia's 7:00 is 45 minutes away, and she's checked in
        setSeat(MONDAY, "07:00", mia, Seat.Status.CHECKED_IN);
        schedules.save(dana, 1, List.of(shorter(5000)));

        ScheduleChangeService.Result r = change.apply(dana);

        assertThat(r.cancelled()).isZero();
        assertThat(at(MONDAY, "07:00").lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(repo.seats(dana, MONDAY, MONDAY)).extracting(Seat::studentId, Seat::seatStatus)
                .contains(org.assertj.core.groups.Tuple.tuple(mia, Seat.Status.CHECKED_IN));
        assertThat(cancels.lines(dana)).extracting(CancellationLine::studentId, CancellationLine::executionStatus)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(mia, ChangeBatch.Execution.SKIPPED));
        assertThat(change.status(dana).orElseThrow().passed()).extracting(CancellationLine::studentId).containsExactly(mia);
    }

    @Test
    void aBatchCancelRefusesASeatThatIsntBookedWhenWritten() {
        now.set(Instant.parse("2026-11-16T12:15:00Z"));
        setSeat(MONDAY, "07:00", mia, Seat.Status.NO_SHOW);
        List<Seat> seen = repo.seats(dana, MONDAY, MONDAY).stream().filter(s -> s.studentId().equals(mia)).toList();

        assertThat(batches.cancel(dana, at(MONDAY, "07:00"), seen, null, List.of(), now.get())).isFalse();
        assertThat(at(MONDAY, "07:00")).isNotNull();
        assertThat(repo.seats(dana, MONDAY, MONDAY)).extracting(Seat::studentId).contains(mia);
    }

    @Test
    void aCancelThatFailsBecauseTheFamilyCancelledFirstStillRemovesTheOpenTime() {
        now.set(Instant.parse("2026-11-11T15:00:00Z"));
        schedules.save(dana, 1, List.of(shorter(5000)));
        // The open-time pass goes through; just before Mia's 7:00 is cancelled, her family cancels it themselves.
        beforeTheFirstBatchWrite(() -> familyCancel.cancel(rossi, dana.coachId(), mia, MONDAY, LocalTime.of(7, 0)));

        change.apply(dana);

        assertThat(at(MONDAY, "07:00")).isNull();
        assertThat(change.drift(dana).clean()).isTrue();
    }

    @Test
    void aTimeTheFamilyCancelledBeforeTheOpenTimePassIsRemovedToo() {
        now.set(Instant.parse("2026-11-11T15:00:00Z"));
        schedules.save(dana, 1, List.of(shorter(5000)));
        // Read as booked, so not in the open-time pass; the family's cancel lands before that pass, so the second read
        // finds it open, with nothing booked to cancel.
        WriteRaces.beforeNextWrites(() -> familyCancel.cancel(rossi, dana.coachId(), mia, MONDAY, LocalTime.of(7, 0)));

        change.apply(dana);

        assertThat(at(MONDAY, "07:00")).isNull();
    }

    @Test
    void aRepriceDoesntLandOnAnotherFamilyWhoBookedTheTimeSinceItWasPlanned() {
        now.set(Instant.parse("2026-11-11T15:00:00Z"));
        schedules.save(dana, 1, List.of(mondayMornings(6000)));
        // The open-time pass goes through; then, before Ava's Monday 6:00 is re-priced, the Parks cancel it and Mia books it.
        beforeTheFirstBatchWrite(() -> {
            familyCancel.cancel(park, dana.coachId(), ava, MONDAY, LocalTime.of(6, 0));
            book(rossi, mia, MONDAY, "06:00");
        });

        change.apply(dana);

        assertThat(at(MONDAY, "06:00").priceMinor()).isEqualTo(5000);
        assertThat(batches.reprices(dana)).filteredOn(l -> l.lessonDate().equals(MONDAY) && l.startTime().equals(LocalTime.of(6, 0)))
                .extracting(RepriceLine::studentId, RepriceLine::executionStatus)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(ava, ChangeBatch.Execution.SKIPPED));
    }

    @Test
    void skippingNeverOverwritesACarriedOutLineOrMakesOneThatIsntThere() {
        now.set(Instant.parse("2026-11-11T15:00:00Z"));
        schedules.save(dana, 1, List.of(shorter(5000)));
        change.apply(dana);
        CancellationLine done = cancels.lines(dana).get(0);
        String missing = "CANCELLED#2026-11-11T15:00:00Z#nope#SEAT#2026-11-16#07:00#x";

        batches.skip(dana, List.of(done.key(), missing), "BOOKING_GONE");

        assertThat(cancels.lines(dana)).extracting(CancellationLine::executionStatus).containsExactly(ChangeBatch.Execution.EXECUTED);
        assertThat(t.f.clients.forSetup().getItem(g -> g.tableName(t.f.table).key(Map.of("PK", AttributeValue.fromS(dana.partitionKey()),
                "SK", AttributeValue.fromS(missing)))).hasItem()).isFalse();
    }
}
