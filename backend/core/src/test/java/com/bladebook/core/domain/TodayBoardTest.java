package com.bladebook.core.domain;

import com.bladebook.core.domain.TodayBoard.BoardSeat;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The coach's Today page (G-6; design {@code coach/static/today.html}): today's lessons with each skater's share and
 * attendance, the next one marked, and the week's and the unpaid figures. Worked out from what's stored; nothing kept.
 */
class TodayBoardTest {

    private static final String TZ = "America/Chicago";
    private static final LocalDate MON = LocalDate.of(2026, 11, 16);
    /** Monday 8:15 AM in Chicago. */
    private static final Instant NOW = Instant.parse("2026-11-16T14:15:00Z");

    private static Instant at(LocalDate d, int h, int m) {
        return d.atTime(h, m).atZone(ZoneId.of(TZ)).toInstant();
    }

    private static LessonTime time(LocalDate d, int h, int m, LessonTime.Status st, int price, int shareCount, List<String> order) {
        return new LessonTime(d, LocalTime.of(h, m), at(d, h, m), TZ, 30, price, "USD", 0, 24, 2, order.size(), 0,
                IceType.BFSC_FREESTYLE, 1, st, shareCount, order);
    }

    private static LessonTime booked(LocalDate d, int h, int m) {
        return time(d, h, m, LessonTime.Status.BOOKED, 5000, 0, List.of());
    }

    private static BoardSeat seat(LocalDate d, int h, int m, String student, Seat.Status st, Payment.Status pay, int joinedSecond) {
        Seat s = new Seat("dana", d, LocalTime.of(h, m), student, "fam-" + student, student + " short", st, at(d, h, m), TZ, 30,
                Instant.parse("2026-11-01T00:00:00Z").plusSeconds(joinedSecond), "k");
        return new BoardSeat(s, pay);
    }

    private static BoardSeat seat(LocalDate d, int h, int m, String student) {
        return seat(d, h, m, student, Seat.Status.BOOKED, Payment.Status.UNPAID, 0);
    }

    private static final Map<String, String> NAMES = Map.of("ava", "Ava Park", "sam", "Sam Rivera", "leo", "Leo Martin");

    private static TodayBoard board(List<LessonTime> times, List<BoardSeat> seats) {
        return new TodayBoard(times, seats, NAMES, "USD", NOW);
    }

    @Test
    void todaysLessonsAreTheBookedAndHeldTimesInOrderWithEachSkatersFullNameShareAndAttendance() {
        TodayBoard b = board(
                List.of(booked(MON, 7, 0), time(MON, 6, 0, LessonTime.Status.HELD, 5000, 0, List.of()),
                        time(MON, 6, 30, LessonTime.Status.OPEN, 5000, 0, List.of()), booked(MON, 9, 0)),
                List.of(seat(MON, 7, 0, "ava", Seat.Status.CHECKED_IN, Payment.Status.UNPAID, 0), seat(MON, 9, 0, "leo")));

        List<TodayBoard.Lesson> day = b.day(MON);

        assertThat(day).extracting(l -> l.time().startTime().toString()).containsExactly("06:00", "07:00", "09:00");
        assertThat(day.get(0).held()).isTrue();
        assertThat(day.get(0).skaters()).isEmpty();
        TodayBoard.Skater ava = day.get(1).skaters().get(0);
        assertThat(ava.name()).isEqualTo("Ava Park");
        assertThat(ava.amountMinor()).isEqualTo(5000);
        assertThat(ava.shown()).isEqualTo(Attendance.Shown.CHECKED_IN);
        assertThat(day.get(2).skaters().get(0).shown()).isEqualTo(Attendance.Shown.BOOKED);
    }

    @Test
    void aLessonThatEndedWithNothingRecordedShowsNotRecorded() {
        TodayBoard b = board(List.of(booked(MON, 7, 0)), List.of(seat(MON, 7, 0, "ava")));
        assertThat(b.day(MON).get(0).skaters().get(0).shown()).isEqualTo(Attendance.Shown.NOT_RECORDED);
    }

    @Test
    void theNextLessonIsTheFirstBookedOneThatHasntStarted() {
        TodayBoard b = board(List.of(booked(MON, 7, 0), time(MON, 8, 30, LessonTime.Status.HELD, 5000, 0, List.of()),
                        booked(MON, 9, 0), booked(MON, 10, 0)),
                List.of(seat(MON, 7, 0, "ava"), seat(MON, 9, 0, "leo"), seat(MON, 10, 0, "sam")));
        assertThat(b.day(MON)).extracting(TodayBoard.Lesson::next).containsExactly(false, false, true, false);
    }

    @Test
    void aLessonStartingNowIsNoLongerNext() {
        TodayBoard b = board(List.of(booked(MON, 8, 15), booked(MON, 9, 0)), List.of(seat(MON, 8, 15, "ava"), seat(MON, 9, 0, "leo")));
        assertThat(b.day(MON)).extracting(TodayBoard.Lesson::next).containsExactly(false, true);
    }

    @Test
    void aSharedLessonListsBothSkatersInJoinOrderWithTheOddCentToTheFirst() {
        LessonTime shared = time(MON, 9, 0, LessonTime.Status.BOOKED, 4501, 2, List.of("sam", "leo"));
        TodayBoard b = board(List.of(shared), List.of(
                seat(MON, 9, 0, "leo", Seat.Status.BOOKED, Payment.Status.UNPAID, 5),
                seat(MON, 9, 0, "sam", Seat.Status.BOOKED, Payment.Status.UNPAID, 1)));
        assertThat(b.day(MON).get(0).skaters()).extracting(s -> s.name() + " " + s.amountMinor())
                .containsExactly("Sam Rivera 2251", "Leo Martin 2250");
    }

    @Test
    void anInvitedSkaterWhoHasntAcceptedIsNotInTheLessonOrTheFigures() {
        TodayBoard b = board(List.of(booked(MON, 9, 0)), List.of(seat(MON, 9, 0, "sam"),
                seat(MON, 9, 0, "leo", Seat.Status.INVITED, Payment.Status.UNPAID, 9)));
        assertThat(b.day(MON).get(0).skaters()).extracting(TodayBoard.Skater::studentId).containsExactly("sam");
        assertThat(b.day(MON).get(0).skaters().get(0).amountMinor()).isEqualTo(5000);
        assertThat(b.booked(MON, MON).count()).isEqualTo(1);
    }

    @Test
    void aSkaterTheCoachNoLongerHasIsShownByTheNameOnTheSeat() {
        TodayBoard b = board(List.of(booked(MON, 9, 0)), List.of(seat(MON, 9, 0, "zoe")));
        assertThat(b.day(MON).get(0).skaters().get(0).name()).isEqualTo("zoe short");
    }

    @Test
    void aBookedTimeWithNoSkaterLeftIsLeftOut() {
        TodayBoard b = board(List.of(booked(MON, 9, 0)), List.of());
        assertThat(b.day(MON)).isEmpty();
    }

    @Test
    void anotherDaysLessonsAreNotToday() {
        TodayBoard b = board(List.of(booked(MON.plusDays(1), 9, 0)), List.of(seat(MON.plusDays(1), 9, 0, "ava")));
        assertThat(b.day(MON)).isEmpty();
    }

    @Test
    void theWeekCountsEachLessonTimeOnceSharedOrNotWhateverHappenedAndAddsUpEverySkatersShare() {
        LocalDate sun = MON.minusDays(1);
        LocalDate sat = MON.plusDays(5);
        LessonTime shared = time(MON.plusDays(2), 9, 0, LessonTime.Status.BOOKED, 5000, 2, List.of("sam", "leo"));
        TodayBoard b = board(List.of(booked(sun, 9, 0), booked(MON, 7, 0), shared, booked(sat, 9, 0), booked(sat.plusDays(1), 9, 0),
                        booked(sun.minusDays(1), 9, 0)),
                List.of(seat(sun, 9, 0, "ava", Seat.Status.NO_SHOW, Payment.Status.WAIVED, 0),
                        seat(MON, 7, 0, "ava", Seat.Status.CHECKED_IN, Payment.Status.PAID, 0),
                        seat(MON.plusDays(2), 9, 0, "sam", Seat.Status.BOOKED, Payment.Status.UNPAID, 0),
                        seat(MON.plusDays(2), 9, 0, "leo", Seat.Status.BOOKED, Payment.Status.UNPAID, 1),
                        seat(sat, 9, 0, "ava"), seat(sat.plusDays(1), 9, 0, "ava"), seat(sun.minusDays(1), 9, 0, "ava")));

        TodayBoard.Figures week = b.booked(sun, sat);

        assertThat(week.count()).isEqualTo(4);   // the shared lesson is one lesson time (owner's ruling, 2026-11-16)
        assertThat(week.amounts()).containsExactly(Map.entry("USD", 20000L));
    }

    @Test
    void aHeldOrEmptyTimeIsNotALessonThisWeek() {
        TodayBoard b = board(List.of(booked(MON, 7, 0), time(MON, 8, 0, LessonTime.Status.HELD, 5000, 0, List.of()),
                        time(MON, 9, 0, LessonTime.Status.OPEN, 5000, 0, List.of()), booked(MON, 10, 0)),
                List.of(seat(MON, 7, 0, "ava"), seat(MON, 8, 0, "leo")));

        TodayBoard.Figures week = b.booked(MON, MON);

        assertThat(week.count()).isEqualTo(1);
        assertThat(week.amounts()).containsExactly(Map.entry("USD", 5000L));
    }

    @Test
    void anEmptyWeekIsNoLessonsAndNoAmounts() {
        TodayBoard.Figures week = board(List.of(), List.of()).booked(MON, MON);
        assertThat(week.count()).isZero();
        assertThat(week.amounts()).isEmpty();
    }

    @Test
    void unpaidIsEveryStartedLessonStillUnpaidIncludingNoShowsAtTheirShare() {
        LocalDate lastMonth = MON.minusDays(40);
        TodayBoard b = board(List.of(booked(lastMonth, 9, 0), booked(MON, 7, 0), booked(MON, 8, 15), booked(MON, 9, 0),
                        time(MON.minusDays(2), 9, 0, LessonTime.Status.BOOKED, 4501, 2, List.of("sam", "leo")), booked(MON.minusDays(3), 9, 0)),
                List.of(seat(lastMonth, 9, 0, "ava", Seat.Status.NO_SHOW, Payment.Status.UNPAID, 0),
                        seat(MON, 7, 0, "ava"),
                        seat(MON, 8, 15, "sam"),                                    // starts now: counts
                        seat(MON, 9, 0, "leo"),                                     // later today: doesn't
                        seat(MON.minusDays(2), 9, 0, "sam", Seat.Status.CHECKED_IN, Payment.Status.PAID, 0),
                        seat(MON.minusDays(2), 9, 0, "leo", Seat.Status.CHECKED_IN, Payment.Status.UNPAID, 1),
                        seat(MON.minusDays(3), 9, 0, "ava", Seat.Status.CHECKED_IN, Payment.Status.WAIVED, 0)));

        TodayBoard.Figures unpaid = b.unpaid();

        assertThat(unpaid.count()).isEqualTo(4);
        assertThat(unpaid.amounts()).containsExactly(Map.entry("USD", 5000L + 5000 + 5000 + 2250));
    }

    @Test
    void amountsAreKeptPerCurrencyNeverAdded() {
        LessonTime cad = new LessonTime(MON, LocalTime.of(7, 0), at(MON, 7, 0), TZ, 30, 6000, "CAD", 0, 24, 1, 1, 0,
                IceType.PUBLIC, 1, LessonTime.Status.BOOKED);
        TodayBoard b = board(List.of(cad, booked(MON, 7, 30)), List.of(seat(MON, 7, 0, "ava"), seat(MON, 7, 30, "leo")));
        assertThat(b.unpaid().amounts()).containsExactly(Map.entry("CAD", 6000L), Map.entry("USD", 5000L));
    }

    @Test
    void aSeatWhoseLessonTimeIsMissingCountsAtNothingInTheCoachsCurrency() {
        TodayBoard b = board(List.of(), List.of(seat(MON, 7, 0, "ava")));
        assertThat(b.unpaid().count()).isEqualTo(1);
        assertThat(b.unpaid().amounts()).containsExactly(Map.entry("USD", 0L));
    }

    @Test
    void theNextLessonAfterADayIsTheFirstBookedSkatersDate() {
        List<BoardSeat> seats = new ArrayList<>(List.of(seat(MON.plusDays(9), 9, 0, "ava"),
                seat(MON.plusDays(4), 9, 0, "leo", Seat.Status.INVITED, Payment.Status.UNPAID, 0),
                seat(MON.plusDays(6), 7, 0, "sam"), seat(MON, 7, 0, "ava")));
        TodayBoard b = board(List.of(), seats);
        assertThat(b.nextLessonAfter(MON)).contains(MON.plusDays(6));
        assertThat(b.nextLessonAfter(MON.plusDays(9))).isEmpty();
    }
}
