package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** What a coach's cancel will do (ADR-MASTER section 10; S8, S9, S11). */
class CoachCancelPlanTest {

    /** Wednesday, November 18, 2026, 2:00 PM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-18T20:00:00Z");
    private static final LocalDate SUN = LocalDate.of(2026, 11, 15);
    private static final LocalDate WED = LocalDate.of(2026, 11, 18);
    private static final LocalDate THU = LocalDate.of(2026, 11, 19);

    private static LessonTime time(LocalDate d, int hour, LessonTime.Status status) {
        Instant at = d.atTime(hour, 0).atZone(ZoneId.of("America/Chicago")).toInstant();
        return new LessonTime(d, LocalTime.of(hour, 0), at, "America/Chicago", 30, 5000, "USD", 0, 24, 1,
                status == LessonTime.Status.BOOKED ? 1 : 0, 1, IceType.PUBLIC, 1, status);
    }

    private static Seat seat(LessonTime t, String who, Seat.Status status) {
        return new Seat("coach-1", t.lessonDate(), t.startTime(), who, "family-" + who, who + " P.", status, t.startsAtUtc(),
                t.coachTz(), 30, Instant.parse("2026-11-10T15:00:00Z"), "key-12345678");
    }

    private static CoachCancelRequest day(LocalDate d, int hour, String after) {
        return CoachCancelRequest.parse("DAY", List.of(new CoachCancelRequest.PickInput(d.toString(), LocalTime.of(hour, 0).toString(), after)), null);
    }

    @Test
    void aBookedLessonIsCancelledWithTheChoiceMade() {
        LessonTime t = time(THU, 6, LessonTime.Status.BOOKED);
        CoachCancelPlan p = CoachCancelPlan.of(day(THU, 6, "HOLD"), List.of(t), List.of(seat(t, "ava", Seat.Status.BOOKED)), NOW);
        assertThat(p.cancels()).hasSize(1);
        assertThat(p.cancels().get(0).after()).isEqualTo(AfterCancel.HOLD);
        assertThat(p.clientIds()).containsExactly("family-ava");
        assertThat(p.heldCount()).isEqualTo(1);
        assertThat(p.skipped()).isZero();
    }

    @Test
    void aLessonThatHasStartedIsSkipped() {
        LessonTime morning = time(WED, 9, LessonTime.Status.BOOKED);
        CoachCancelPlan p = CoachCancelPlan.of(day(WED, 9, "RELEASE"), List.of(morning), List.of(seat(morning, "ava", Seat.Status.BOOKED)), NOW);
        assertThat(p.cancels()).isEmpty();
        assertThat(p.skipped()).isEqualTo(1);
        assertThat(p.isEmpty()).isTrue();
    }

    @Test
    void aCheckedInOrNoShowLessonIsNeverCancelled() {
        LessonTime t = time(WED, 15, LessonTime.Status.BOOKED);
        assertThat(CoachCancelPlan.of(day(WED, 15, "RELEASE"), List.of(t), List.of(seat(t, "ava", Seat.Status.CHECKED_IN)), NOW).cancels()).isEmpty();
        assertThat(CoachCancelPlan.of(day(WED, 15, "RELEASE"), List.of(t), List.of(seat(t, "ava", Seat.Status.NO_SHOW)), NOW).cancels()).isEmpty();
    }

    @Test
    void anOpenHeldOrMissingTimeIsSkippedForALessonOrDay() {
        LessonTime open = time(THU, 6, LessonTime.Status.OPEN);
        LessonTime held = time(THU, 7, LessonTime.Status.HELD);
        CoachCancelRequest r = CoachCancelRequest.parse("DAY", List.of(
                new CoachCancelRequest.PickInput("2026-11-19", "06:00", "HOLD"),
                new CoachCancelRequest.PickInput("2026-11-19", "07:00", "HOLD"),
                new CoachCancelRequest.PickInput("2026-11-19", "08:00", "HOLD")), null);
        CoachCancelPlan p = CoachCancelPlan.of(r, List.of(open, held), List.of(), NOW);
        assertThat(p.cancels()).isEmpty();
        assertThat(p.holdOpen()).isEmpty();
        assertThat(p.skipped()).isEqualTo(3);
    }

    @Test
    void theRestOfTheWeekHoldsEveryBookedLessonAndOpenTimeFromNowOn() {
        LessonTime pastBooked = time(WED, 9, LessonTime.Status.BOOKED);
        LessonTime pastOpen = time(WED, 10, LessonTime.Status.OPEN);
        LessonTime laterBooked = time(WED, 16, LessonTime.Status.BOOKED);
        LessonTime thuOpen = time(THU, 6, LessonTime.Status.OPEN);
        LessonTime thuHeld = time(THU, 7, LessonTime.Status.HELD);
        LessonTime nextSunday = time(SUN.plusDays(7), 6, LessonTime.Status.OPEN);
        List<Seat> seats = List.of(seat(pastBooked, "mia", Seat.Status.BOOKED), seat(laterBooked, "ava", Seat.Status.BOOKED));

        CoachCancelPlan p = CoachCancelPlan.of(CoachCancelRequest.parse("WEEK", null, SUN.toString()),
                List.of(pastBooked, pastOpen, laterBooked, thuOpen, thuHeld, nextSunday), seats, NOW);

        assertThat(p.cancels()).extracting(c -> c.time().key()).containsExactly(laterBooked.key());
        assertThat(p.cancels()).allMatch(c -> c.after() == AfterCancel.HOLD);
        assertThat(p.holdOpen()).containsExactly(thuOpen);
        assertThat(p.heldCount()).isEqualTo(2);
        assertThat(p.firstDate()).isEqualTo(WED);
        assertThat(p.lastDate()).isEqualTo(THU);
    }

    @Test
    void aFutureWeekClosesAllOfIt() {
        LocalDate next = SUN.plusDays(7);
        LessonTime sun = time(next, 6, LessonTime.Status.OPEN);
        LessonTime sat = time(next.plusDays(6), 6, LessonTime.Status.BOOKED);
        CoachCancelPlan p = CoachCancelPlan.of(CoachCancelRequest.parse("WEEK", null, next.toString()), List.of(sun, sat),
                List.of(seat(sat, "ava", Seat.Status.BOOKED)), NOW);
        assertThat(p.holdOpen()).containsExactly(sun);
        assertThat(p.cancels()).hasSize(1);
    }

    @Test
    void anUnansweredInvitationGoesWithTheLessonButHasNoLine() {
        LessonTime t = time(THU, 6, LessonTime.Status.BOOKED);
        CoachCancelPlan p = CoachCancelPlan.of(day(THU, 6, "RELEASE"), List.of(t),
                List.of(seat(t, "ava", Seat.Status.BOOKED), seat(t, "zoe", Seat.Status.INVITED)), NOW);
        assertThat(p.cancels().get(0).seats()).hasSize(2);
        assertThat(p.cancels().get(0).bookedSeats()).extracting(Seat::studentId).containsExactly("ava");
        assertThat(p.clientIds()).containsExactly("family-ava");
    }

    @Test
    void twoSkatersOfOneFamilyAreOneFamily() {
        LessonTime a = time(THU, 6, LessonTime.Status.BOOKED);
        LessonTime b = time(THU, 7, LessonTime.Status.BOOKED);
        Seat ava = seat(a, "ava", Seat.Status.BOOKED);
        Seat jack = new Seat("coach-1", b.lessonDate(), b.startTime(), "jack", "family-ava", "Jack P.", Seat.Status.BOOKED,
                b.startsAtUtc(), b.coachTz(), 30, Instant.parse("2026-11-10T15:00:00Z"), "key-12345678");
        CoachCancelRequest r = CoachCancelRequest.parse("DAY", List.of(new CoachCancelRequest.PickInput("2026-11-19", "06:00", "RELEASE"),
                new CoachCancelRequest.PickInput("2026-11-19", "07:00", "RELEASE")), null);
        CoachCancelPlan p = CoachCancelPlan.of(r, List.of(a, b), List.of(ava, jack), NOW);
        assertThat(p.cancels()).hasSize(2);
        assertThat(p.clientIds()).containsExactly("family-ava");
        assertThat(p.heldCount()).isZero();
    }
}
