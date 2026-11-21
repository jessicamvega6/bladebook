package com.bladebook.core.data;

import com.bladebook.core.domain.AfterCancel;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelPlan;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A seat that ends is moved, not kept: the seat deleted and its CANCELLED# line put, with the lesson time released or
 * held, in one transaction (ADR-MASTER sections 3, 9 and 10).
 */
class CancellationRepositoryTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    /** Sunday, November 15, 2026, 8:30 AM in Chicago: 21.5 hours before Monday's 6:00. */
    private static final Instant NOW = Instant.parse("2026-11-15T14:30:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);

    private DynamoDbLocal.Fixture f;
    private CancellationRepository cancels;
    private BookingRepository bookings;
    private ScheduleRepository schedules;
    private AccessContext dana;
    private ClientContext park;
    private LinkedSkater ava;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        cancels = new CancellationRepository(f.clients, f.table);
        bookings = new BookingRepository(f.clients, f.table);
        schedules = new ScheduleRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        Skater k = FamilyTestData.skater("Ava Park");
        park = FamilyTestData.register(f, List.of(k), dana);
        FamilyTestData.approve(f, dana, park, k);
        ava = new ClientLinks(f.clients, f.table).requireActive(park, dana.coachId(), k.studentId());
        FamilyTestData.openTime(f, dana, MONDAY, SIX, 5000, 1);
        FamilyTestData.openTime(f, dana, MONDAY, LocalTime.of(6, 30), 5000, 1);
    }

    private AvailableTime time(LocalTime start) {
        return bookings.times(park, ava.coach(), MONDAY, MONDAY).stream().filter(t -> t.startTime().equals(start)).findFirst().orElseThrow();
    }

    private Seat book(LocalTime start) {
        bookings.book(park, ava, time(start), UUID.randomUUID().toString(), BOOKED_AT);
        return cancels.ownSeat(park, ava, MONDAY, start).orElseThrow();
    }

    private static ChangeBatch batch(ChangeBatch.Source source, ChangeBatch.By by, String who, ChangeBatch.Execution status) {
        return new ChangeBatch(UUID.randomUUID().toString(), NOW, source, by, who, MONDAY, MONDAY, 1, 1, status);
    }

    private LessonTime stored(LocalTime start) {
        return schedules.lessonTimes(dana, MONDAY, MONDAY).stream().filter(t -> t.startTime().equals(start)).findFirst().orElseThrow();
    }

    // ------------------------------------------------------------------ the family

    @Test
    void theFamilyReadsItsOwnSeatAndNoOneElses() {
        Seat mine = book(SIX);
        assertThat(mine.studentId()).isEqualTo(ava.studentId());
        assertThat(mine.clientId()).isEqualTo(park.clientId());
        assertThat(cancels.ownSeat(park, ava, MONDAY, LocalTime.of(6, 30))).isEmpty();
    }

    @Test
    void aFamilyCancelMovesTheSeatToALineAndReopensTheTime() {
        Seat seat = book(SIX);
        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, park.clientId(), ChangeBatch.Execution.EXECUTED);
        CancellationLine line = CancellationLine.of(b, seat, 5000, "USD", NOW);

        assertThat(cancels.cancelByFamily(park, ava, b, seat, line, NOW)).isTrue();

        assertThat(cancels.ownSeat(park, ava, MONDAY, SIX)).isEmpty();
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).isEmpty();
        LessonTime t = stored(SIX);
        assertThat(t.lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(t.seatsTaken()).isZero();
        assertThat(time(SIX).free()).isTrue();
        assertThat(time(SIX).joinOrder()).isEmpty();

        assertThat(cancels.lines(dana)).containsExactly(line);
        assertThat(cancels.lines(dana).get(0).noticeHours()).isEqualTo(21);
        assertThat(cancels.batches(dana)).containsExactly(b);
    }

    @Test
    void theSameSkaterCanBookTheTimeAgainAfterCancelling() {
        Seat seat = book(SIX);
        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, park.clientId(), ChangeBatch.Execution.EXECUTED);
        cancels.cancelByFamily(park, ava, b, seat, CancellationLine.of(b, seat, 5000, "USD", NOW), NOW);

        assertThat(book(SIX).seatStatus()).isEqualTo(Seat.Status.BOOKED);
        assertThat(stored(SIX).lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void aSecondCancelOfTheSameSeatWritesNothing() {
        Seat seat = book(SIX);
        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, park.clientId(), ChangeBatch.Execution.EXECUTED);
        cancels.cancelByFamily(park, ava, b, seat, CancellationLine.of(b, seat, 5000, "USD", NOW), NOW);

        ChangeBatch again = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, park.clientId(), ChangeBatch.Execution.EXECUTED);
        assertThat(cancels.cancelByFamily(park, ava, again, seat, CancellationLine.of(again, seat, 5000, "USD", NOW), NOW)).isFalse();
        assertThat(cancels.lines(dana)).hasSize(1);
        assertThat(cancels.batches(dana)).hasSize(1);
    }

    @Test
    void aLessonThatHasStartedCantBeCancelled() {
        Seat seat = book(SIX);
        Instant started = Instant.parse("2026-11-16T12:00:00Z");
        ChangeBatch b = new ChangeBatch(UUID.randomUUID().toString(), started, ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT,
                park.clientId(), MONDAY, MONDAY, 1, 1, ChangeBatch.Execution.EXECUTED);
        assertThat(cancels.cancelByFamily(park, ava, b, seat, CancellationLine.of(b, seat, 5000, "USD", started), started)).isFalse();
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).hasSize(1);
        assertThat(stored(SIX).lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(cancels.lines(dana)).isEmpty();
    }

    @Test
    void aSeatTheCoachHasMarkedCantBeCancelledByTheFamily() {
        Seat seat = book(SIX);
        Map<String, AttributeValue> item = new HashMap<>(SeatItems.item(seat));
        item.put("seatStatus", AttributeValue.fromS("CHECKED_IN"));
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(item));

        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, park.clientId(), ChangeBatch.Execution.EXECUTED);
        assertThat(cancels.cancelByFamily(park, ava, b, seat, CancellationLine.of(b, seat, 5000, "USD", NOW), NOW)).isFalse();
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).hasSize(1);
    }

    // ------------------------------------------------------------------- the coach

    private CoachCancelPlan.Cancel planned(LocalTime start, AfterCancel after) {
        LessonTime t = stored(start);
        List<Seat> seats = schedules.seats(dana, MONDAY, MONDAY).stream().filter(s -> s.startTime().equals(start)).toList();
        return new CoachCancelPlan.Cancel(t, seats, after);
    }

    @Test
    void theCoachReleasesALessonInOneTransactionWithItsHeader() {
        Seat seat = book(SIX);
        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.COACH, dana.coachId(), ChangeBatch.Execution.EXECUTED);
        CancellationLine line = CancellationLine.of(b, seat, 5000, "USD", NOW);

        assertThat(cancels.cancelByCoach(dana, b, planned(SIX, AfterCancel.RELEASE), List.of(line), b, NOW)).isTrue();

        assertThat(stored(SIX).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(cancels.lines(dana)).extracting(CancellationLine::cancelledBy).containsExactly(ChangeBatch.By.COACH);
        assertThat(cancels.batches(dana)).containsExactly(b);
    }

    @Test
    void theCoachHoldsALessonAndFamiliesSeeItTaken() {
        Seat seat = book(SIX);
        ChangeBatch b = batch(ChangeBatch.Source.DAY, ChangeBatch.By.COACH, dana.coachId(), ChangeBatch.Execution.PLANNED);
        cancels.start(dana, b);

        assertThat(cancels.cancelByCoach(dana, b, planned(SIX, AfterCancel.HOLD), List.of(CancellationLine.of(b, seat, 5000, "USD", NOW)),
                null, NOW)).isTrue();
        cancels.finish(dana, b.executed(1, 1));

        LessonTime t = stored(SIX);
        assertThat(t.lessonStatus()).isEqualTo(LessonTime.Status.HELD);
        assertThat(t.seatsTaken()).isZero();
        assertThat(time(SIX).free()).isFalse();
        assertThat(cancels.batches(dana)).extracting(ChangeBatch::executionStatus).containsExactly(ChangeBatch.Execution.EXECUTED);
    }

    @Test
    void aCoachCancelOfALessonTheFamilyAlreadyCancelledWritesNothing() {
        Seat seat = book(SIX);
        CoachCancelPlan.Cancel asRead = planned(SIX, AfterCancel.HOLD);
        ChangeBatch fb = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.CLIENT, park.clientId(), ChangeBatch.Execution.EXECUTED);
        cancels.cancelByFamily(park, ava, fb, seat, CancellationLine.of(fb, seat, 5000, "USD", NOW), NOW);

        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.COACH, dana.coachId(), ChangeBatch.Execution.EXECUTED);
        assertThat(cancels.cancelByCoach(dana, b, asRead, List.of(CancellationLine.of(b, seat, 5000, "USD", NOW)), b, NOW)).isFalse();
        assertThat(stored(SIX).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(cancels.lines(dana)).hasSize(1);
    }

    @Test
    void anUnansweredInvitationIsDeletedWithNoLine() {
        Seat seat = book(SIX);
        Seat invited = new Seat(dana.coachId(), MONDAY, SIX, "zoe-1", "other-family", "Zoe O.", Seat.Status.INVITED,
                seat.startsAtUtc(), seat.coachTz(), 30, BOOKED_AT, "key-87654321");
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(SeatItems.item(invited)));
        // The invitation holds a place (ADR-031 decision 5).
        f.clients.forSetup().updateItem(b -> b.tableName(f.table).key(FamilyItems.key("COACH#" + dana.coachId(), LessonTime.key(MONDAY, SIX)))
                .updateExpression("SET seatsTaken = :two").expressionAttributeValues(Map.of(":two", AttributeValue.fromN("2"))));

        ChangeBatch b = batch(ChangeBatch.Source.LESSON, ChangeBatch.By.COACH, dana.coachId(), ChangeBatch.Execution.EXECUTED);
        CoachCancelPlan.Cancel c = planned(SIX, AfterCancel.RELEASE);
        assertThat(c.seats()).hasSize(2);
        assertThat(cancels.cancelByCoach(dana, b, c, List.of(CancellationLine.of(b, seat, 5000, "USD", NOW)), b, NOW)).isTrue();

        assertThat(schedules.seats(dana, MONDAY, MONDAY)).isEmpty();
        assertThat(cancels.lines(dana)).extracting(CancellationLine::studentId).containsExactly(ava.studentId());
    }

    @Test
    void anOpenTimeIsHeldOnlyWhileItsStillOpenAndAhead() {
        assertThat(cancels.holdOpen(dana, stored(LocalTime.of(6, 30)), NOW)).isTrue();
        assertThat(stored(LocalTime.of(6, 30)).lessonStatus()).isEqualTo(LessonTime.Status.HELD);
        assertThat(cancels.holdOpen(dana, stored(LocalTime.of(6, 30)), NOW)).isFalse();

        book(SIX);
        assertThat(cancels.holdOpen(dana, stored(SIX), NOW)).isFalse();
        assertThat(stored(SIX).lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void anOpenTimeThatHasStartedIsntHeld() {
        assertThat(cancels.holdOpen(dana, stored(SIX), Instant.parse("2026-11-16T12:00:00Z"))).isFalse();
        assertThat(stored(SIX).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
    }
}
