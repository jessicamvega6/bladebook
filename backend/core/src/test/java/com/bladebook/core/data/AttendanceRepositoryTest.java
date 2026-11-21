package com.bladebook.core.data;

import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Capture is conditional on the seat still being booked; correction overwrites (ADR-MASTER section 11). */
class AttendanceRepositoryTest {

    private static final Instant BOOKED_AT = Instant.parse("2026-11-10T15:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final Instant TAP = Instant.parse("2026-11-16T12:03:00Z");

    private AttendanceRepository attendance;
    private AccessContext dana;
    private String seatKey;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        attendance = new AttendanceRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        Skater ava = FamilyTestData.skater("Ava Park");
        ClientContext park = FamilyTestData.register(f, List.of(ava), dana);
        FamilyTestData.approve(f, dana, park, ava);
        LinkedSkater linked = new ClientLinks(f.clients, f.table).requireActive(park, dana.coachId(), ava.studentId());
        FamilyTestData.openTime(f, dana, MONDAY, LocalTime.of(6, 0), 5000, 1);
        BookingRepository bookings = new BookingRepository(f.clients, f.table);
        AvailableTime six = bookings.times(park, linked.coach(), MONDAY, MONDAY).get(0);
        bookings.book(park, linked, six, UUID.randomUUID().toString(), BOOKED_AT);
        seatKey = Seat.key(MONDAY, LocalTime.of(6, 0), ava.studentId());
    }

    @Test
    void captureRecordsTheOutcomeAndTapTimeOnce() {
        assertThat(attendance.capture(dana, seatKey, Seat.Status.CHECKED_IN, TAP, TAP.plusSeconds(5))).isEqualTo(AttendanceRepository.Capture.RECORDED);
        AttendanceRepository.SeatOutcome s = attendance.seats(dana, MONDAY, MONDAY).get(0);
        assertThat(s.seat().seatStatus()).isEqualTo(Seat.Status.CHECKED_IN);
        assertThat(s.outcomeAt()).isEqualTo(TAP);

        // A replay, or a second tap, fails the condition and changes nothing.
        assertThat(attendance.capture(dana, seatKey, Seat.Status.NO_SHOW, TAP.plusSeconds(60), TAP.plusSeconds(70)))
                .isEqualTo(AttendanceRepository.Capture.ALREADY_RECORDED);
        assertThat(attendance.seats(dana, MONDAY, MONDAY).get(0).seat().seatStatus()).isEqualTo(Seat.Status.CHECKED_IN);
    }

    @Test
    void aSeatThatIsGoneIsReportedAsGone() {
        assertThat(attendance.capture(dana, Seat.key(MONDAY, LocalTime.of(7, 0), "nobody"), Seat.Status.NO_SHOW, TAP, TAP))
                .isEqualTo(AttendanceRepository.Capture.GONE);
        assertThat(attendance.correct(dana, Seat.key(MONDAY, LocalTime.of(7, 0), "nobody"), Seat.Status.NO_SHOW, TAP)).isFalse();
    }

    @Test
    void correctionOverwritesWhateverWasRecordedAndKeepsTheTapTime() {
        attendance.capture(dana, seatKey, Seat.Status.CHECKED_IN, TAP, TAP);
        assertThat(attendance.correct(dana, seatKey, Seat.Status.NO_SHOW, TAP.plusSeconds(86400))).isTrue();
        AttendanceRepository.SeatOutcome s = attendance.seats(dana, MONDAY, MONDAY).get(0);
        assertThat(s.seat().seatStatus()).isEqualTo(Seat.Status.NO_SHOW);
        assertThat(s.outcomeAt()).isEqualTo(TAP);
        // A stale queued capture arriving after the correction is dropped.
        assertThat(attendance.capture(dana, seatKey, Seat.Status.CHECKED_IN, TAP, TAP)).isEqualTo(AttendanceRepository.Capture.ALREADY_RECORDED);
    }

    @Test
    void aBookedSeatCanBeCorrectedStraightAwayAndHasNoTapTimeUntilThen() {
        assertThat(attendance.seats(dana, MONDAY, MONDAY).get(0).outcomeAt()).isNull();
        assertThat(attendance.correct(dana, seatKey, Seat.Status.CHECKED_IN, TAP)).isTrue();
        assertThat(attendance.seats(dana, MONDAY, MONDAY).get(0).outcomeAt()).isEqualTo(TAP);
    }
}
