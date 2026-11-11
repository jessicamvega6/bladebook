package com.bladebook.core.data;

import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Booking one time is one transaction: the lesson time from OPEN to BOOKED and the skater's seat put, or neither
 * (ADR-031 decision 4). A failed date is attributed by reading the family's own seat.
 */
class BookingRepositoryTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);

    private DynamoDbLocal.Fixture f;
    private BookingRepository bookings;
    private ScheduleRepository schedules;
    private ClientLinks links;
    private AccessContext dana;
    private Skater ava;
    private ClientContext park;
    private LinkedSkater avaWithDana;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        bookings = new BookingRepository(f.clients, f.table);
        schedules = new ScheduleRepository(f.clients, f.table);
        links = new ClientLinks(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        ava = FamilyTestData.skater("Ava Park");
        park = FamilyTestData.register(f, List.of(ava), dana);
        FamilyTestData.approve(f, dana, park, ava);
        avaWithDana = links.requireActive(park, dana.coachId(), ava.studentId());
        FamilyTestData.openTime(f, dana, MONDAY, SIX, 5000, 1);
        FamilyTestData.openTime(f, dana, MONDAY, LocalTime.of(6, 30), 4501, 2);
    }

    private AvailableTime time(LocalTime start) {
        return bookings.times(park, avaWithDana.coach(), MONDAY, MONDAY).stream()
                .filter(t -> t.startTime().equals(start)).findFirst().orElseThrow();
    }

    @Test
    void theFamilyReadsFreeOrTakenAndThePriceButNoNames() {
        List<AvailableTime> times = bookings.times(park, avaWithDana.coach(), MONDAY, MONDAY);
        assertThat(times).extracting(AvailableTime::startTime).containsExactly(SIX, LocalTime.of(6, 30));
        AvailableTime six = times.get(0);
        assertThat(six.free()).isTrue();
        assertThat(six.priceMinor()).isEqualTo(5000);
        assertThat(six.currency()).isEqualTo("USD");
        assertThat(six.durationMinutes()).isEqualTo(30);
        assertThat(six.coachTz()).isEqualTo("America/Chicago");
        assertThat(six.startsAtUtc()).isEqualTo(Instant.parse("2026-11-16T12:00:00Z"));
    }

    @Test
    void bookingTurnsTheTimeBookedAndPutsTheSkatersSeat() {
        String key = UUID.randomUUID().toString();
        assertThat(bookings.book(park, avaWithDana, time(SIX), key, NOW)).isEqualTo(BookingOutcome.BOOKED);

        LessonTime stored = schedules.lessonTimes(dana, MONDAY, MONDAY).get(0);
        assertThat(stored.lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(stored.seatsTaken()).isEqualTo(1);
        assertThat(time(SIX).free()).isFalse();
        assertThat(time(SIX).shareCount()).isEqualTo(1);
        assertThat(time(SIX).joinOrder()).containsExactly(ava.studentId());

        List<Seat> seats = schedules.seats(dana, MONDAY, MONDAY);
        assertThat(seats).hasSize(1);
        Seat s = seats.get(0);
        assertThat(s.key()).isEqualTo("SEAT#2026-11-16#06:00#" + ava.studentId());
        assertThat(s.studentName()).isEqualTo("Ava P.");
        assertThat(s.clientId()).isEqualTo(park.clientId());
        assertThat(s.seatStatus()).isEqualTo(Seat.Status.BOOKED);
        assertThat(s.idempotencyKey()).isEqualTo(key);
        assertThat(s.joinedAt()).isEqualTo(NOW);
        assertThat(s.startsAtUtc()).isEqualTo(Instant.parse("2026-11-16T12:00:00Z"));
        assertThat(s.durationMinutes()).isEqualTo(30);
        assertThat(s.coachTz()).isEqualTo("America/Chicago");
    }

    @Test
    void aRetryWithTheSameKeyFindsItsOwnWriteAndBooksNothingTwice() {
        String key = UUID.randomUUID().toString();
        AvailableTime six = time(SIX);
        bookings.book(park, avaWithDana, six, key, NOW);

        assertThat(bookings.book(park, avaWithDana, six, key, NOW)).isEqualTo(BookingOutcome.BOOKED);
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).hasSize(1);
        assertThat(schedules.lessonTimes(dana, MONDAY, MONDAY).get(0).seatsTaken()).isEqualTo(1);
    }

    @Test
    void anotherRequestForATimeTheSkaterHoldsIsAlreadyBooked() {
        AvailableTime six = time(SIX);
        bookings.book(park, avaWithDana, six, UUID.randomUUID().toString(), NOW);
        assertThat(bookings.book(park, avaWithDana, six, UUID.randomUUID().toString(), NOW)).isEqualTo(BookingOutcome.ALREADY_BOOKED);
    }

    @Test
    void aTimeAnotherFamilyHoldsIsUnavailable() {
        Skater mia = FamilyTestData.skater("Mia Rossi");
        ClientContext rossi = FamilyTestData.register(f, List.of(mia), dana);
        FamilyTestData.approve(f, dana, rossi, mia);
        LinkedSkater miaWithDana = links.requireActive(rossi, dana.coachId(), mia.studentId());
        AvailableTime six = time(SIX);
        bookings.book(rossi, miaWithDana, six, UUID.randomUUID().toString(), NOW);

        assertThat(bookings.book(park, avaWithDana, six, UUID.randomUUID().toString(), NOW)).isEqualTo(BookingOutcome.UNAVAILABLE);
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).extracting(Seat::studentId).containsExactly(mia.studentId());
    }

    @Test
    void aTimeThatHasStartedIsUnavailable() {
        Instant later = Instant.parse("2026-11-16T12:00:00Z");
        assertThat(bookings.book(park, avaWithDana, time(SIX), UUID.randomUUID().toString(), later)).isEqualTo(BookingOutcome.UNAVAILABLE);
        assertThat(schedules.lessonTimes(dana, MONDAY, MONDAY).get(0).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).isEmpty();
    }

    @Test
    void aTimeThatChangedLengthSinceItWasReadIsUnavailable() {
        AvailableTime read = time(SIX);
        AvailableTime stale = new AvailableTime(read.lessonDate(), read.startTime(), read.startsAtUtc(), read.coachTz(), 45,
                read.priceMinor(), read.currency(), true, 0, List.of(), read.blockSeq());
        assertThat(bookings.book(park, avaWithDana, stale, UUID.randomUUID().toString(), NOW)).isEqualTo(BookingOutcome.UNAVAILABLE);
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).isEmpty();
    }

    @Test
    void aTimeThatNoLongerExistsIsUnavailable() {
        AvailableTime gone = new AvailableTime(MONDAY, LocalTime.of(9, 0), Instant.parse("2026-11-16T15:00:00Z"),
                "America/Chicago", 30, 5000, "USD", true, 0, List.of(), 1);
        assertThat(bookings.book(park, avaWithDana, gone, UUID.randomUUID().toString(), NOW)).isEqualTo(BookingOutcome.UNAVAILABLE);
        assertThat(bookings.attribute(park, avaWithDana, MONDAY, LocalTime.of(9, 0), "any-key-123")).isEqualTo(BookingOutcome.UNAVAILABLE);
    }

    @Test
    void ofTwoFamiliesRacingForOneTimeExactlyOneGetsIt() throws Exception {
        Skater mia = FamilyTestData.skater("Mia Rossi");
        ClientContext rossi = FamilyTestData.register(f, List.of(mia), dana);
        FamilyTestData.approve(f, dana, rossi, mia);
        LinkedSkater miaWithDana = links.requireActive(rossi, dana.coachId(), mia.studentId());
        AvailableTime six = time(SIX);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<BookingOutcome>> both = List.of(
                    () -> bookings.book(park, avaWithDana, six, UUID.randomUUID().toString(), NOW),
                    () -> bookings.book(rossi, miaWithDana, six, UUID.randomUUID().toString(), NOW));
            List<BookingOutcome> results = pool.invokeAll(both).stream().map(BookingRepositoryTest::get).toList();
            assertThat(results).containsExactlyInAnyOrder(BookingOutcome.BOOKED, BookingOutcome.UNAVAILABLE);
        } finally {
            pool.shutdownNow();
        }
        assertThat(schedules.seats(dana, MONDAY, MONDAY)).hasSize(1);
        assertThat(schedules.lessonTimes(dana, MONDAY, MONDAY).get(0).seatsTaken()).isEqualTo(1);
    }

    @Test
    void theFamilyFindsItsOwnSeatsThroughGsi1AndNoOneElses() {
        // A second family, so the index has someone else's seat to leave out.
        Skater mia = FamilyTestData.skater("Mia Rossi");
        ClientContext rossi = FamilyTestData.register(f, List.of(mia), dana);
        FamilyTestData.approve(f, dana, rossi, mia);
        bookings.book(rossi, links.requireActive(rossi, dana.coachId(), mia.studentId()), time(LocalTime.of(6, 30)),
                UUID.randomUUID().toString(), NOW);

        bookings.book(park, avaWithDana, time(SIX), UUID.randomUUID().toString(), NOW);

        List<Seat> mine = bookings.familySeats(park, MONDAY.minusDays(1), MONDAY.plusDays(1));
        assertThat(mine).extracting(Seat::studentId).containsExactly(ava.studentId());
        assertThat(mine.get(0).coachId()).isEqualTo(dana.coachId());
        assertThat(bookings.familySeats(park, MONDAY.plusDays(1), MONDAY.plusDays(2))).isEmpty();
    }

    @Test
    void theCoachsNameZoneAndNoticeAreReadable() {
        BookingRepository.CoachClock c = bookings.coach(park, avaWithDana.coach()).orElseThrow();
        assertThat(c.firstName()).isEqualTo("Dana");
        assertThat(c.lastName()).isEqualTo("Whitfield");
        assertThat(c.coachTimezone()).isEqualTo("America/Chicago");
        assertThat(c.requiredNoticeHours()).isEqualTo(24);
    }

    private static <T> T get(Future<T> f) {
        try {
            return f.get();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
