package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Recurrence;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;
import com.bladebook.core.service.BookingService.MyLesson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Shared lessons end to end on DynamoDB Local (ADR-MASTER section 8; ADR-026, ADR-031, ADR-033): booking with a share code,
 * the invited family's answer, withdrawing, leaving in time and late, the staying family's answer, the hourly sweep,
 * freed places, a shared series (B4), and the coach's cancel of an unanswered invitation (S11). Prices are shares of the
 * lesson's $50 (B10).
 */
class ShareServiceTest {

    /** Monday, November 9, 2026, 9:00 AM in Chicago. */
    private static final Instant START = Instant.parse("2026-11-09T15:00:00Z");
    private static final LocalDate MON = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);
    /** Monday, November 16, 6:00 AM in Chicago. */
    private static final Instant SIX_AT = Instant.parse("2026-11-16T12:00:00Z");
    private static final String DANA = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(START);
    private FamilyTestSupport t;
    private Clock clock;
    private ScheduleRepository scheduleRepo;
    private CancellationRepository cancelRepo;
    private BookingService booking;
    private CancellationService cancels;
    private RecurrenceService series;
    private ShareService shares;
    private DeadlineSweepService sweep;
    private AccessContext dana;
    private ClientContext park;
    private ClientContext chen;
    private String ava;
    private String jack;
    private String mia;
    private String lily;
    private String miaCode;
    private String jackCode;
    private String lilyCode;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        scheduleRepo = new ScheduleRepository(t.f.clients, t.f.table);
        cancelRepo = new CancellationRepository(t.f.clients, t.f.table);
        BookingRepository bookingRepo = new BookingRepository(t.f.clients, t.f.table);
        ShareRepository shareRepo = new ShareRepository(t.f.clients, t.f.table);
        ClientLinks links = new ClientLinks(t.f.clients, t.f.table);
        InviteSyncService invite = new InviteSyncService(shareRepo);
        booking = new BookingService(links, bookingRepo, t.families, shareRepo, clock, invite);
        cancels = new CancellationService(links, bookingRepo, cancelRepo, clock, invite);
        series = new RecurrenceService(links, bookingRepo, cancelRepo, clock, invite);
        shares = new ShareService(links, bookingRepo, t.families, shareRepo, cancelRepo, clock, invite);
        sweep = new DeadlineSweepService(shareRepo, invite);

        dana = t.coach("Dana", DANA);
        // Mondays 6:00–8:00, 30 minutes, $50, up to 2 skaters; Tuesdays the same but private.
        new ScheduleService(scheduleRepo, t.coaches).save(dana, 0, List.of(
                new BlockTemplate(1, "Morning ice", SIX, LocalTime.of(8, 0), 30, 5000, 2, IceType.BFSC_FREESTYLE,
                        EnumSet.of(DayOfWeek.MONDAY), Map.of()),
                new BlockTemplate(2, "Power", SIX, LocalTime.of(7, 0), 30, 5000, 1, IceType.BFSC_FREESTYLE,
                        EnumSet.of(DayOfWeek.TUESDAY), Map.of())));
        new ScheduleChangeService(scheduleRepo, t.coaches, clock).apply(dana);

        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA),
                FamilyTestSupport.kid("Ava Park", DANA), FamilyTestSupport.kid("Jack Park", DANA), FamilyTestSupport.kid("Lily Park", DANA)));
        chen = FamilyTestSupport.newFamily();
        t.registration.register(chen, "grace@example.com", new com.bladebook.core.domain.RegistrationRequest("Grace", "Chen",
                "(205) 555-0111", "GUARDIAN", List.of(DANA), List.of(FamilyTestSupport.kid("Mia Chen", DANA))));
        ava = id(park, "Ava Park");
        jack = id(park, "Jack Park");
        lily = id(park, "Lily Park");
        mia = id(chen, "Mia Chen");
        // Dana accepts everyone but Lily.
        t.studentRepo.list(dana).stream().filter(r -> !r.studentName().equals("Lily Park"))
                .forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        t.familySync.issueShareCodes(park.clientId());
        t.familySync.issueShareCodes(chen.clientId());
        miaCode = code(chen, mia);
        jackCode = code(park, jack);
        lilyCode = code(park, lily);
    }

    private String id(ClientContext family, String name) {
        return t.familyService.view(family).skaters().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow().studentId();
    }

    private String code(ClientContext family, String studentId) {
        return t.familyService.view(family).skaters().stream().filter(s -> s.studentId().equals(studentId)).findFirst().orElseThrow().shareCode();
    }

    private BookingService.BookingResult bookAva(String shareCode, LocalDate... dates) {
        List<BookingRequest.PickInput> picks = java.util.Arrays.stream(dates).map(d -> new BookingRequest.PickInput(d.toString(), "06:00")).toList();
        return booking.book(park, BookingRequest.parse(dana.coachId(), ava, UUID.randomUUID().toString(), picks), shareCode);
    }

    private LessonTime lesson(LocalDate d) {
        return scheduleRepo.lessonTimes(dana, d, d).stream().filter(l -> l.startTime().equals(SIX)).findFirst().orElseThrow();
    }

    private MyLesson parkLesson(LocalDate d, String studentId) {
        return booking.myBookings(park).upcoming().stream().filter(l -> l.lesson().date().equals(d) && l.lesson().studentId().equals(studentId))
                .findFirst().orElseThrow();
    }

    private MyLesson chenLesson(LocalDate d) {
        return booking.myBookings(chen).upcoming().stream().filter(l -> l.lesson().date().equals(d)).findFirst().orElseThrow();
    }

    private void miaAccepted(LocalDate... dates) {
        bookAva(miaCode, dates);
        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
    }

    // ------------------------------------------------------------------ share-check (ADR-033 d2a)

    @Test
    void theShareCheckGivesTheDisplayNameAndWhetherTheCoachAcceptedThem() {
        assertThat(shares.check(park, dana.coachId(), miaCode)).isEqualTo(new ShareService.ShareCheck("Mia C.", true));
        assertThat(shares.check(chen, dana.coachId(), lilyCode.toLowerCase().replace("-", ""))).isEqualTo(new ShareService.ShareCheck("Lily P.", false));
    }

    @Test
    void anUnknownCodeOrACoachTheFamilyIsntWithIsAPlainNotFound() {
        assertThatThrownBy(() -> shares.check(park, dana.coachId(), "MIA-22222"))
                .isInstanceOf(DomainException.class).extracting("reason").isEqualTo(DomainException.Reason.NO_SUCH_ITEM);
        assertThatThrownBy(() -> shares.check(park, UUID.randomUUID().toString(), miaCode))
                .isInstanceOf(DomainException.class).extracting("reason").isEqualTo(DomainException.Reason.NO_SUCH_ITEM);
    }

    // -------------------------------------------------------------------- booking with a code

    @Test
    void bookingWithACodeHoldsTheInvitedPlaceAndTheBookingFamilyPaysInFull() {
        BookingService.BookingResult r = bookAva(miaCode, MON);

        assertThat(r.picks()).extracting(BookingService.PickResult::outcome).containsExactly(BookingOutcome.BOOKED);
        assertThat(r.shared()).isEqualTo(new BookingService.Shared("Mia C.", false, 1));
        LessonTime l = lesson(MON);
        assertThat(l.seatsTaken()).isEqualTo(2);
        assertThat(l.shareCount()).isEqualTo(1);
        MyLesson mine = parkLesson(MON, ava);
        assertThat(mine.priceMinor()).isEqualTo(5000);
        assertThat(mine.share().partnerName()).isEqualTo("Mia C.");
        assertThat(mine.share().partnerStatus()).isEqualTo("INVITED");
        assertThat(mine.share().inviteId()).isNotNull();
        // Other families see the time taken, never that it could be shared.
        assertThat(booking.page(chen, dana.coachId(), mia).times().stream().filter(x -> x.date().equals(MON) && x.startTime().equals(SIX))
                .findFirst().orElseThrow().free()).isFalse();
    }

    @Test
    void theInvitedFamilySeesTheInvitationWithItsShareButNoLessonYet() {
        bookAva(miaCode, MON);

        List<ShareService.Invitation> inv = shares.invitations(chen);
        assertThat(inv).hasSize(1);
        ShareService.Invitation i = inv.get(0);
        assertThat(i.studentName()).isEqualTo("Mia Chen");
        assertThat(i.hostName()).isEqualTo("Ava P.");
        assertThat(i.invitedByName()).isEqualTo("Sarah Park");
        assertThat(i.coachFirstName()).isEqualTo("Dana");
        assertThat(i.priceMinor()).isEqualTo(5000);
        assertThat(i.shareMinor()).isEqualTo(2500);
        assertThat(i.skaters()).isEqualTo(2);
        assertThat(i.status()).isEqualTo("OPEN");
        assertThat(i.series()).isFalse();
        assertThat(booking.myBookings(chen).upcoming()).isEmpty();
    }

    @Test
    void aTimeThatTakesOneSkaterIsBookedPrivateWithACode() {
        LocalDate tue = MON.plusDays(1);
        BookingService.BookingResult r = booking.book(park, BookingRequest.parse(dana.coachId(), ava, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(tue.toString(), "06:00"))), miaCode);
        assertThat(r.picks().get(0).outcome()).isEqualTo(BookingOutcome.BOOKED);
        assertThat(r.shared()).isNull();
        assertThat(shares.invitations(chen)).isEmpty();
    }

    @Test
    void aCodeThatDoesntCheckOutBooksNothing() {
        assertThatThrownBy(() -> bookAva("MIA-22222", MON)).isInstanceOf(DomainException.class)
                .hasMessage("That code doesn’t match a skater. Check it with the other family.");
        assertThatThrownBy(() -> bookAva(code(park, ava), MON)).isInstanceOf(DomainException.class)
                .hasMessage("That’s Ava’s own code. Enter the other skater’s code.");
        assertThatThrownBy(() -> bookAva(lilyCode, MON)).isInstanceOf(DomainException.class)
                .hasMessage("Lily is not available to add until Coach Dana accepts them.");
        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
    }

    @Test
    void anotherFamilysSkaterTheCoachHasntAcceptedCantBeInvited() {
        ClientContext ng = FamilyTestSupport.newFamily();
        t.registration.register(ng, "ng@example.com", FamilyTestSupport.guardian(List.of(DANA), FamilyTestSupport.kid("Zoe Ng", DANA)));
        t.familySync.issueShareCodes(ng.clientId());
        String zoe = code(ng, id(ng, "Zoe Ng"));

        assertThatThrownBy(() -> bookAva(zoe, MON)).isInstanceOf(DomainException.class)
                .hasMessage("Zoe N. isn’t one of Coach Dana’s students yet. Zoe’s family can sign up with Coach Dana’s code, and once"
                        + " Coach Dana accepts Zoe you can share a lesson.");
        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
    }

    @Test
    void aSiblingIsAddedDirectlyAndEachPaysTheirShare() {
        BookingService.BookingResult r = bookAva(jackCode, MON);

        assertThat(r.shared()).isEqualTo(new BookingService.Shared("Jack P.", true, 1));
        assertThat(lesson(MON).shareCount()).isEqualTo(2);
        assertThat(parkLesson(MON, ava).priceMinor()).isEqualTo(2500);
        assertThat(parkLesson(MON, jack).priceMinor()).isEqualTo(2500);
        assertThat(parkLesson(MON, ava).share().partnerName()).isEqualTo("Jack P.");
        assertThat(shares.invitations(chen)).isEmpty();
    }

    // ------------------------------------------------------------------- the invited family answers

    @Test
    void goingAheadJoinsTheLessonAndSplitsThePrice() {
        bookAva(miaCode, MON);
        ShareService.Answered a = shares.accept(chen, shares.invitations(chen).get(0).inviteId());

        assertThat(a.done()).containsExactly(MON);
        assertThat(lesson(MON).shareCount()).isEqualTo(2);
        assertThat(chenLesson(MON).priceMinor()).isEqualTo(2500);
        assertThat(chenLesson(MON).share().joined()).isTrue();
        assertThat(chenLesson(MON).share().partnerName()).isEqualTo("Ava P.");
        assertThat(parkLesson(MON, ava).priceMinor()).isEqualTo(2500);
        assertThat(parkLesson(MON, ava).share().partnerStatus()).isEqualTo("BOOKED");
        assertThat(shares.invitations(chen)).isEmpty();
    }

    @Test
    void decliningLeavesTheLessonPrivateAtTheFullPrice() {
        bookAva(miaCode, MON);
        shares.decline(chen, shares.invitations(chen).get(0).inviteId());

        assertThat(lesson(MON).seatsTaken()).isEqualTo(1);
        assertThat(parkLesson(MON, ava).priceMinor()).isEqualTo(5000);
        assertThat(parkLesson(MON, ava).share().partnerStatus()).isEqualTo("DECLINED");
        assertThat(shares.invitations(chen)).isEmpty();
    }

    @Test
    void answeringAnInvitationThatEndedIsNoLongerAvailable() {
        bookAva(miaCode, MON);
        String id = shares.invitations(chen).get(0).inviteId();
        shares.withdraw(park, parkLesson(MON, ava).share().inviteId());

        assertThat(parkLesson(MON, ava).share().partnerStatus()).isEqualTo("WITHDRAWN");
        assertThatThrownBy(() -> shares.accept(chen, id)).isInstanceOf(DomainException.class).hasMessage("This lesson is no longer available.");
    }

    @Test
    void cancellingWithAnInvitationUnansweredWithdrawsItAndReleasesTheTime() {
        bookAva(miaCode, MON);
        CancellationService.FamilyCancel c = cancels.cancel(park, dana.coachId(), ava, MON, SIX);

        assertThat(c.leave()).isEqualTo(Sharing.Leave.WITHDRAW);
        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(lesson(MON).seatsTaken()).isZero();
        assertThat(shares.invitations(chen)).isEmpty();
    }

    // ------------------------------------------------------------------------ leaving

    @Test
    void leavingInTimeAsksTheStayingFamilyAndTheirShareStands() {
        miaAccepted(MON);
        now.set(Instant.parse("2026-11-12T15:00:00Z")); // Thursday: 3 days and 21 hours before
        CancellationService.FamilyCancel c = cancels.cancel(chen, dana.coachId(), mia, MON, SIX);

        assertThat(c.leave()).isEqualTo(Sharing.Leave.IN_TIME);
        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.BOOKED);
        MyLesson mine = parkLesson(MON, ava);
        assertThat(mine.priceMinor()).isEqualTo(2500);
        assertThat(mine.share().partnerStatus()).isEqualTo("LEFT");
        assertThat(mine.share().partnerName()).isEqualTo("Mia C.");
        // Answer by the start of the 24-hour notice period, which comes before 7 days after the leave.
        assertThat(mine.share().answerBy()).isEqualTo(SIX_AT.minus(Duration.ofHours(24)));
    }

    @Test
    void keepingMakesItPrivateAtTheFullPriceAndAFreedPlace() {
        miaAccepted(MON);
        now.set(Instant.parse("2026-11-12T15:00:00Z"));
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);

        ShareService.Answered a = shares.keep(park, dana.coachId(), ava, SIX, List.of(MON));

        assertThat(a.done()).containsExactly(MON);
        MyLesson mine = parkLesson(MON, ava);
        assertThat(mine.priceMinor()).isEqualTo(5000);
        assertThat(mine.share().answerBy()).isNull();
        assertThat(mine.share().freedPlace()).isTrue();
        assertThat(lesson(MON).shareCount()).isEqualTo(1);
    }

    @Test
    void aFreedPlaceTakesAOneLessonInvitationOrASibling() {
        miaAccepted(MON);
        now.set(Instant.parse("2026-11-12T15:00:00Z"));
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);
        shares.keep(park, dana.coachId(), ava, SIX, List.of(MON));

        ShareService.Filled f = shares.fillFreedPlace(park, dana.coachId(), ava, MON, SIX, jackCode);

        assertThat(f).isEqualTo(new ShareService.Filled("Jack P.", true));
        assertThat(parkLesson(MON, ava).priceMinor()).isEqualTo(2500);
        assertThat(parkLesson(MON, jack).priceMinor()).isEqualTo(2500);
        assertThatThrownBy(() -> shares.fillFreedPlace(park, dana.coachId(), ava, MON, SIX, miaCode)).isInstanceOf(DomainException.class);
    }

    @Test
    void cancellingAWaitingDateIsNoChargeAndReleasesTheTime() {
        miaAccepted(MON);
        now.set(Instant.parse("2026-11-12T15:00:00Z"));
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);

        CancellationService.Answered a = cancels.cancelWaiting(park, dana.coachId(), ava, List.of(MON), SIX);

        assertThat(a.done()).containsExactly(MON);
        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        assertThat(cancelRepo.lines(dana)).hasSize(2);
    }

    @Test
    void noAnswerByTheAnswerByTimeIsCancelledByTheSweepWithNoAnswer() {
        miaAccepted(MON);
        now.set(Instant.parse("2026-11-12T15:00:00Z"));
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);
        Instant by = SIX_AT.minus(Duration.ofHours(24));

        assertThat(sweep.sweep(by.minusSeconds(60)).cancelledNoAnswer()).isZero();
        assertThat(sweep.sweep(by).cancelledNoAnswer()).isEqualTo(1);

        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
        CancellationLine line = cancelRepo.lines(dana).stream().filter(l -> l.cancelledBy() == ChangeBatch.By.NO_ANSWER).findFirst().orElseThrow();
        assertThat(line.studentId()).isEqualTo(ava);
        assertThat(sweep.sweep(by.plusSeconds(3600))).isEqualTo(new DeadlineSweepService.Swept(0, 0, 0));
        now.set(by);
        assertThat(booking.myBookings(park).upcoming()).isEmpty();
    }

    @Test
    void keepingAfterTheAnswerByTimeIsRefused() {
        miaAccepted(MON);
        now.set(Instant.parse("2026-11-12T15:00:00Z"));
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);
        now.set(SIX_AT.minus(Duration.ofHours(24)));

        assertThat(shares.keep(park, dana.coachId(), ava, SIX, List.of(MON)).skipped()).containsExactly(MON);
    }

    @Test
    void leavingLateLeavesTheStayingSkatersShareAndAsksNothing() {
        miaAccepted(MON);
        now.set(SIX_AT.minus(Duration.ofHours(3)));
        CancellationService.FamilyCancel c = cancels.cancel(chen, dana.coachId(), mia, MON, SIX);

        assertThat(c.leave()).isEqualTo(Sharing.Leave.LATE);
        assertThat(c.late()).isTrue();
        MyLesson mine = parkLesson(MON, ava);
        assertThat(mine.priceMinor()).isEqualTo(2500);
        assertThat(mine.share().answerBy()).isNull();
        assertThat(lesson(MON).shareCount()).isEqualTo(2);
        CancellationLine line = cancelRepo.lines(dana).get(0);
        assertThat(line.priceMinor()).isEqualTo(2500);
    }

    // ------------------------------------------------------------------------- expiry (B8)

    @Test
    void anUnansweredInvitationExpiresWhenTheLessonStarts() {
        bookAva(miaCode, MON);
        now.set(SIX_AT);
        assertThat(shares.invitations(chen).get(0).status()).isEqualTo("EXPIRED");

        assertThat(sweep.sweep(SIX_AT).expired()).isEqualTo(1);
        assertThat(shares.invitations(chen)).isEmpty();
        assertThat(lesson(MON).seatsTaken()).isEqualTo(1);
        assertThat(sweep.sweep(SIX_AT.plusSeconds(3600)).expired()).isZero();
    }

    // ------------------------------------------------------------------------- a shared series

    @Test
    void oneInvitationCoversASeriesAndEachDateJoinsOnItsOwn() {
        BookingRequest req = BookingRequest.parse(dana.coachId(), ava, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(MON.toString(), "06:00")), true, 1, MON.plusWeeks(2).toString());
        booking.book(park, req, miaCode);

        ShareService.Invitation i = shares.invitations(chen).get(0);
        assertThat(i.series()).isTrue();
        assertThat(i.dates()).hasSize(3);
        assertThat(shares.accept(chen, i.inviteId()).done()).hasSize(3);
        assertThat(booking.myBookings(chen).series()).isEmpty();
    }

    @Test
    void aSharedSeriesCanOnlyBeCancelledWhole() {
        BookingRequest req = BookingRequest.parse(dana.coachId(), ava, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(MON.toString(), "06:00")), true, 1, MON.plusWeeks(2).toString());
        booking.book(park, req, miaCode);
        String rid = booking.myBookings(park).series().get(0).recurrence().recurrenceId();

        assertThatThrownBy(() -> series.change(park, dana.coachId(), rid, "END_EARLIER", MON.toString(), null))
                .isInstanceOf(DomainException.class).hasMessageStartingWith("This series is shared");
        assertThatThrownBy(() -> series.change(park, dana.coachId(), rid, "LESS_OFTEN", null, 2)).isInstanceOf(DomainException.class);

        RecurrenceService.Changed c = series.change(park, dana.coachId(), rid, "STOP", null, null);
        assertThat(c.cancelled()).isEqualTo(3);
        assertThat(c.after().status()).isEqualTo(Recurrence.Status.ENDED);
        assertThat(shares.invitations(chen)).isEmpty();
        assertThat(lesson(MON).lessonStatus()).isEqualTo(LessonTime.Status.OPEN);
    }

    // ------------------------------------------------------------------------- the coach (S11)

    @Test
    void theCoachsCancelDeletesAnUnansweredInvitationWithNoRecord() {
        bookAva(miaCode, MON);
        String id = shares.invitations(chen).get(0).inviteId();
        new CoachCancelService(scheduleRepo, cancelRepo, clock).cancel(dana, CoachCancelRequest.parse("LESSON",
                List.of(new CoachCancelRequest.PickInput(MON.toString(), "06:00", "RELEASE")), null));

        assertThat(shares.invitations(chen)).isEmpty();
        assertThatThrownBy(() -> shares.accept(chen, id)).hasMessage("This lesson is no longer available.");
        assertThat(cancelRepo.lines(dana)).extracting(CancellationLine::studentId).containsExactly(ava);
    }

    @Test
    void theCoachsCalendarNamesOnlySkatersInTheLessonNotOneStillInvited() {
        bookAva(miaCode, MON);
        CalendarService cal = new CalendarService(scheduleRepo, t.coaches, t.studentRepo, clock);
        assertThat(cal.range(dana, MON, MON).days().get(0).booked()).extracting(CalendarService.Booked::shortName).containsExactly("Ava P.");

        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
        assertThat(cal.range(dana, MON, MON).days().get(0).booked()).extracting(CalendarService.Booked::shortName)
                .containsExactlyInAnyOrder("Ava P.", "Mia C.");
    }

    @Test
    void theCoachSeesBothSkatersEachAtTheirShare() {
        miaAccepted(MON);
        List<Seat> seats = scheduleRepo.seats(dana, MON, MON);
        assertThat(seats).extracting(Seat::studentName).containsExactlyInAnyOrder("Ava P.", "Mia C.");
        assertThat(lesson(MON).shareFor(5000, mia, List.of())).isEqualTo(2500);
    }
}
