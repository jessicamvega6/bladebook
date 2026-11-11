package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.BookingRequest.PickInput;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.service.BookingService.BookingPage;
import com.bladebook.core.service.BookingService.BookingResult;
import com.bladebook.core.service.BookingService.PickResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Booking one lesson, family side (ADR-MASTER section 7; FeatureDecriptions/Bookings:). */
class BookingServiceTest {

    /** Tuesday, November 10, 2026, 9:00 AM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final String DANA_CODE = "7K2Q-M9XT";

    private FamilyTestSupport t;
    private BookingService booking;
    private ScheduleRepository scheduleRepo;
    private AccessContext dana;
    private ClientContext park;
    private String ava;
    private String jack;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        scheduleRepo = new ScheduleRepository(t.f.clients, t.f.table);
        booking = new BookingService(new ClientLinks(t.f.clients, t.f.table), new BookingRepository(t.f.clients, t.f.table),
                t.families, clock);

        dana = t.coach("Dana", DANA_CODE);
        new ScheduleService(scheduleRepo, t.coaches).save(dana, 0, List.of(mondayMornings(5000)));
        new ScheduleChangeService(scheduleRepo, t.coaches, clock).apply(dana);

        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE),
                FamilyTestSupport.kid("Ava Park", DANA_CODE), FamilyTestSupport.kid("Jack Park", DANA_CODE)));
        ava = idOf(park, "Ava Park");
        jack = idOf(park, "Jack Park");
        approve("Ava Park");
    }

    private String idOf(ClientContext family, String name) {
        return t.familyService.view(family).skaters().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow().studentId();
    }

    private void approve(String name) {
        t.studentRepo.list(dana).stream().filter(r -> r.studentName().equals(name)).forEach(r ->
                t.links.approved(t.studentRepo.approve(dana, r.studentId())));
    }

    private static PickInput pick(LocalDate d, String time) {
        return new PickInput(d.toString(), time);
    }

    private BookingResult book(ClientContext family, String studentId, String key, PickInput... picks) {
        return booking.book(family, BookingRequest.parse(dana.coachId(), studentId, key, List.of(picks)));
    }

    @Test
    void thePageShowsTheCoachTheWindowAndEveryFreeTimeInsideIt() {
        BookingPage p = booking.page(park, dana.coachId(), ava);

        assertThat(p.coachFirstName()).isEqualTo("Dana");
        assertThat(p.coachTimezone()).isEqualTo("America/Chicago");
        assertThat(p.requiredNoticeHours()).isEqualTo(24);
        assertThat(p.today()).isEqualTo(LocalDate.of(2026, 11, 10));
        assertThat(p.now()).isEqualTo(LocalTime.of(9, 0));
        assertThat(p.windowFirst()).isEqualTo(LocalDate.of(2026, 11, 10));
        assertThat(p.windowLast()).isEqualTo(LocalDate.of(2027, 1, 31));
        assertThat(p.hasSchedule()).isTrue();
        // Mondays 6:00 to 8:00 in 30 minutes: Nov 16 to Jan 25, eleven Mondays of four times.
        assertThat(p.times()).hasSize(44);
        assertThat(p.times().get(0)).satisfies(x -> {
            assertThat(x.date()).isEqualTo(MONDAY);
            assertThat(x.startTime()).isEqualTo(LocalTime.of(6, 0));
            assertThat(x.endTime()).isEqualTo(LocalTime.of(6, 30));
            assertThat(x.priceMinor()).isEqualTo(5000);
            assertThat(x.currency()).isEqualTo("USD");
            assertThat(x.blockName()).isEqualTo("Morning ice");
            assertThat(x.free()).isTrue();
            assertThat(x.started()).isFalse();
        });
        assertThat(p.times().get(43).date()).isEqualTo(LocalDate.of(2027, 1, 25));
        assertThat(p.familyLessons()).isEmpty();
    }

    @Test
    void aSkaterStillWaitingCantSeeTheCoachsTimes() {
        assertThatThrownBy(() -> booking.page(park, dana.coachId(), jack))
                .isInstanceOf(DomainException.class)
                .hasMessage("Jack’s lessons are no longer available to book. Contact Coach Dana.");
    }

    @Test
    void bookingTwoTimesBooksBothAndThePageThenShowsThemAsTheFamilys() {
        BookingResult r = book(park, ava, UUID.randomUUID().toString(), pick(MONDAY, "06:00"), pick(MONDAY.plusDays(7), "07:30"));

        assertThat(r.coachFirstName()).isEqualTo("Dana");
        assertThat(r.picks()).extracting(PickResult::outcome).containsExactly(BookingOutcome.BOOKED, BookingOutcome.BOOKED);
        assertThat(r.picks().get(0).priceMinor()).isEqualTo(5000);
        assertThat(r.picks().get(0).durationMinutes()).isEqualTo(30);

        BookingPage p = booking.page(park, dana.coachId(), ava);
        assertThat(p.times().get(0).free()).isFalse();
        assertThat(p.familyLessons()).extracting(BookingService.FamilyLesson::studentId).containsExactly(ava, ava);
        assertThat(p.familyLessons().get(0).studentName()).isEqualTo("Ava Park");
        assertThat(scheduleRepo.lessonTimes(dana, MONDAY, MONDAY).get(0).lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void sendingTheSameRequestAgainBooksNothingTwice() {
        String key = UUID.randomUUID().toString();
        book(park, ava, key, pick(MONDAY, "06:00"));

        assertThat(book(park, ava, key, pick(MONDAY, "06:00")).picks().get(0).outcome()).isEqualTo(BookingOutcome.BOOKED);
        assertThat(book(park, ava, UUID.randomUUID().toString(), pick(MONDAY, "06:00")).picks().get(0).outcome())
                .isEqualTo(BookingOutcome.ALREADY_BOOKED);
        assertThat(scheduleRepo.seats(dana, MONDAY, MONDAY)).hasSize(1);
    }

    @Test
    void aTimeThatDoesntExistOrIsTakenIsUnavailableAndTheRestStillBook() {
        ClientContext rossi = FamilyTestSupport.newFamily();
        t.registration.register(rossi, "rossi@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE), FamilyTestSupport.kid("Mia Rossi", DANA_CODE)));
        approve("Mia Rossi");
        book(rossi, idOf(rossi, "Mia Rossi"), UUID.randomUUID().toString(), pick(MONDAY, "06:30"));

        BookingResult r = book(park, ava, UUID.randomUUID().toString(),
                pick(MONDAY, "06:00"), pick(MONDAY, "06:30"), pick(MONDAY, "09:00"));

        assertThat(r.picks()).extracting(PickResult::outcome)
                .containsExactly(BookingOutcome.BOOKED, BookingOutcome.UNAVAILABLE, BookingOutcome.UNAVAILABLE);
        assertThat(r.picks().get(2).priceMinor()).isNull();
    }

    @Test
    void onePickPastTheWindowRefusesTheWholeRequest() {
        assertThatThrownBy(() -> book(park, ava, UUID.randomUUID().toString(),
                pick(MONDAY, "06:00"), pick(LocalDate.of(2027, 2, 1), "06:00")))
                .isInstanceOf(DomainException.class).hasMessage("That date is further ahead than you can book.");
        assertThat(scheduleRepo.seats(dana, MONDAY, LocalDate.of(2027, 2, 28))).isEmpty();
    }

    @Test
    void aSkaterStillWaitingCantBook() {
        assertThatThrownBy(() -> book(park, jack, UUID.randomUUID().toString(), pick(MONDAY, "06:00")))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).reason()).isEqualTo(DomainException.Reason.CONFLICT);
        assertThat(scheduleRepo.seats(dana, MONDAY, MONDAY)).isEmpty();
    }

    @Test
    void anotherFamilysSkaterIsNotFound() {
        ClientContext rossi = FamilyTestSupport.newFamily();
        t.registration.register(rossi, "rossi@example.com", FamilyTestSupport.guardian(List.of(DANA_CODE), FamilyTestSupport.kid("Mia Rossi", DANA_CODE)));
        approve("Mia Rossi");

        assertThatThrownBy(() -> book(park, idOf(rossi, "Mia Rossi"), UUID.randomUUID().toString(), pick(MONDAY, "06:00")))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).reason()).isEqualTo(DomainException.Reason.NO_SUCH_ITEM);
    }

    @Test
    void upcomingListsTheFamilysLessonsWithEveryCoachInOrder() {
        book(park, ava, UUID.randomUUID().toString(), pick(MONDAY.plusDays(7), "07:00"), pick(MONDAY, "06:30"));

        List<BookingService.FamilyLesson> up = booking.upcoming(park);

        assertThat(up).extracting(BookingService.FamilyLesson::date).containsExactly(MONDAY, MONDAY.plusDays(7));
        assertThat(up.get(0).coachFirstName()).isEqualTo("Dana");
        assertThat(up.get(0).studentName()).isEqualTo("Ava Park");
        assertThat(up.get(0).startTime()).isEqualTo(LocalTime.of(6, 30));
        assertThat(up.get(0).durationMinutes()).isEqualTo(30);
        assertThat(up.get(0).startsAtUtc()).isEqualTo(Instant.parse("2026-11-16T12:30:00Z"));
    }

    @Test
    void aCoachWithNoScheduleSaysSo() {
        AccessContext ben = t.coach("Ben", "4R8T-WH6C");
        ClientContext lee = FamilyTestSupport.newFamily();
        t.registration.register(lee, "lee@example.com", FamilyTestSupport.guardian(List.of("4R8T-WH6C"), FamilyTestSupport.kid("Sam Lee", "4R8T-WH6C")));
        t.studentRepo.list(ben).forEach(r -> t.links.approved(t.studentRepo.approve(ben, r.studentId())));

        BookingPage p = booking.page(lee, ben.coachId(), idOf(lee, "Sam Lee"));
        assertThat(p.hasSchedule()).isFalse();
        assertThat(p.times()).isEmpty();
    }
}
