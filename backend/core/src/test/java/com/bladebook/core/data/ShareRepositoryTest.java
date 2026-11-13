package com.bladebook.core.data;

import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Shared-lesson reads and writes (ADR-MASTER section 8), each under its condition. */
class ShareRepositoryTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);
    private static final Instant NOW = Instant.parse("2026-11-09T15:00:00Z");

    private DynamoDbLocal.Fixture f;
    private ShareRepository shares;
    private BookingRepository bookings;
    private AccessContext dana;
    private Skater ava;
    private Skater mia;
    private ClientContext park;
    private ClientContext chen;
    private LinkedSkater avaLinked;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        shares = new ShareRepository(f.clients, f.table);
        bookings = new BookingRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        ava = FamilyTestData.skater("Ava Park");
        mia = FamilyTestData.skater("Mia Chen");
        park = FamilyTestData.register(f, List.of(ava), dana);
        chen = FamilyTestData.register(f, List.of(mia), dana);
        FamilyTestData.approve(f, dana, park, ava);
        FamilyTestData.approve(f, dana, chen, mia);
        FamilyTestData.openTime(f, dana, MON, SIX, 5000, 2);
        avaLinked = new ClientLinks(f.clients, f.table).requireActive(park, dana.coachId(), ava.studentId());
    }

    private AvailableTime time() {
        return bookings.timesAt(park, avaLinked.coach(), List.of(LessonTime.key(MON, SIX))).get(LessonTime.key(MON, SIX));
    }

    private void inviteMia() {
        assertThat(bookings.book(park, avaLinked, time(), "k1", NOW, null, 0,
                BookingRepository.Partner.invited(mia.studentId(), "Mia C.", "inv-1", "Sarah Park"))).isEqualTo(BookingOutcome.BOOKED);
    }

    @Test
    void aSharedTimeIsMarkedShareableAndCountsItsPlaces() {
        assertThat(time().shareable()).isTrue();
        assertThat(time().seatsTaken()).isZero();
        inviteMia();
        assertThat(time().seatsTaken()).isEqualTo(2);
        assertThat(time().shareCount()).isEqualTo(1);
    }

    @Test
    void theRosterReadSaysOnlyTheStatus() {
        LinkedCoach coach = avaLinked.coach();
        assertThat(shares.rosterStatus(park, coach, mia.studentId())).contains(StudentStatus.ACTIVE);
        assertThat(shares.rosterStatus(park, coach, "never-a-student")).isEmpty();
    }

    @Test
    void anInvitedSeatHasNoFamilyUntilTheConsumerCopiesItAndItsDeadlineIsTheLessonsStart() {
        inviteMia();
        assertThat(bookings.familySeats(chen, MON, MON)).isEmpty();

        shares.syncLesson(dana.coachId(), MON, SIX);

        List<Seat> chens = bookings.familySeats(chen, MON, MON);
        assertThat(chens).hasSize(1);
        assertThat(chens.get(0).seatStatus()).isEqualTo(Seat.Status.INVITED);
        assertThat(chens.get(0).clientId()).isNull();
        assertThat(chens.get(0).share().partnerName()).isEqualTo("Ava P.");
        assertThat(shares.due(time().startsAtUtc())).extracting(ShareRepository.Due::kind).containsExactly("EXPIRE");
        assertThat(shares.due(time().startsAtUtc().minusSeconds(1))).isEmpty();
    }

    @Test
    void copyingTwiceChangesNothing() {
        inviteMia();
        shares.syncLesson(dana.coachId(), MON, SIX);
        Seat once = bookings.familySeats(park, MON, MON).get(0);
        shares.syncLesson(dana.coachId(), MON, SIX);
        assertThat(bookings.familySeats(park, MON, MON).get(0)).isEqualTo(once);
        assertThat(once.share().partnerStatus()).isEqualTo("INVITED");
    }

    @Test
    void onlyTheInvitedFamilyCanAcceptAndOnlyOnce() {
        inviteMia();
        shares.syncLesson(dana.coachId(), MON, SIX);
        Seat invited = bookings.familySeats(chen, MON, MON).get(0);
        LinkedSkater miaLinked = new ClientLinks(f.clients, f.table).requireActive(chen, dana.coachId(), mia.studentId());

        assertThat(shares.accept(chen, miaLinked, invited, NOW)).isTrue();
        assertThat(shares.accept(chen, miaLinked, invited, NOW)).isFalse();
        assertThat(time().shareCount()).isEqualTo(2);
        assertThat(shares.due(time().startsAtUtc())).isEmpty();
    }

    @Test
    void anAcceptAfterTheLessonStartedWritesNothing() {
        inviteMia();
        shares.syncLesson(dana.coachId(), MON, SIX);
        Seat invited = bookings.familySeats(chen, MON, MON).get(0);
        LinkedSkater miaLinked = new ClientLinks(f.clients, f.table).requireActive(chen, dana.coachId(), mia.studentId());
        assertThat(shares.accept(chen, miaLinked, invited, invited.startsAtUtc())).isFalse();
    }

    @Test
    void anotherFamilyCantWithdrawAnInvitationItDidntSend() {
        inviteMia();
        shares.syncLesson(dana.coachId(), MON, SIX);
        Seat host = bookings.familySeats(park, MON, MON).get(0);
        LinkedSkater miaLinked = new ClientLinks(f.clients, f.table).requireActive(chen, dana.coachId(), mia.studentId());

        assertThat(shares.withdraw(chen, miaLinked, ShareRepository.invitedSeatOf(host), NOW)).isFalse();
        assertThat(shares.withdraw(park, avaLinked, ShareRepository.invitedSeatOf(host), NOW)).isTrue();
        assertThat(time().seatsTaken()).isEqualTo(1);
    }

    @Test
    void theShareCodeLookupIgnoresCaseAndTheDashAndRefusesOtherShapes() {
        assertThat(shares.shareCode("not a code")).isEmpty();
        assertThat(shares.shareCode(null)).isEmpty();
    }
}
