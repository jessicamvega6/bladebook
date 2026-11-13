package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.LocalStream;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.domain.Email;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.StudentRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Batch 13 end to end on DynamoDB Local: each write the APIs make, handed to the consumers as the local stand-in for the
 * table's stream would (SC-20), and the emails that come out, with their guards (ADR-MASTER sections 13 and 14). Coach
 * Dana teaches Mondays 6:00–8:00 (30 minutes, $50, up to 2 skaters) and Tuesdays 6:00–7:00 privately.
 */
class NotificationServiceTest {

    /** Monday, November 9, 2026, 9:00 AM in Chicago. */
    private static final Instant START = Instant.parse("2026-11-09T15:00:00Z");
    private static final LocalDate MON = LocalDate.of(2026, 11, 16);
    private static final LocalTime SIX = LocalTime.of(6, 0);
    private static final LocalTime HALF_SIX = LocalTime.of(6, 30);
    private static final String DANA = "7K2Q-M9XT";

    private final AtomicReference<Instant> now = new AtomicReference<>(START);
    private final AtomicBoolean refuse = new AtomicBoolean(false);
    private FamilyTestSupport t;
    private Clock clock;
    private LocalOutbox outbox;
    private LocalStream stream;
    private LocalStreamRouter router;
    private NotifyRepository notify;
    private NotificationService notifications;
    private ScheduledJobs jobs;
    private ScheduleRepository scheduleRepo;
    private CancellationRepository cancelRepo;
    private BookingService booking;
    private CancellationService cancels;
    private ShareService shares;
    private RecurrenceService series;
    private DeadlineSweepService sweep;
    private CoachCancelService coachCancels;
    private AttendanceService attendance;
    private PaymentService payments;
    private ScheduleChangeService scheduleChange;
    private AccessContext dana;
    private ClientContext park;
    private ClientContext chen;
    private String ava;
    private String jack;
    private String mia;
    private String miaCode;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        outbox = new LocalOutbox(clock);
        Mailer mailer = e -> {
            if (refuse.get()) {
                throw new IllegalStateException("SES refused it");
            }
            outbox.send(e);
        };
        stream = t.f.clients.localStream();
        stream.switchOn();
        notify = new NotifyRepository(t.f.clients, t.f.table);
        notifications = new NotificationService(notify, mailer, new NotificationService.Links("https://bladebook.test/"), clock);
        router = new LocalStreamRouter(notifications);
        scheduleRepo = new ScheduleRepository(t.f.clients, t.f.table);
        scheduleChange = new ScheduleChangeService(scheduleRepo, t.coaches, clock);
        jobs = new ScheduledJobs(notify, notifications, scheduleChange, mailer, 7);
        cancelRepo = new CancellationRepository(t.f.clients, t.f.table);
        BookingRepository bookingRepo = new BookingRepository(t.f.clients, t.f.table);
        ShareRepository shareRepo = new ShareRepository(t.f.clients, t.f.table);
        ClientLinks links = new ClientLinks(t.f.clients, t.f.table);
        InviteSyncService invite = new InviteSyncService(shareRepo);
        booking = new BookingService(links, bookingRepo, t.families, shareRepo, clock, invite);
        cancels = new CancellationService(links, bookingRepo, cancelRepo, clock, invite);
        shares = new ShareService(links, bookingRepo, t.families, shareRepo, cancelRepo, clock, invite);
        series = new RecurrenceService(links, bookingRepo, cancelRepo, clock, invite);
        sweep = new DeadlineSweepService(shareRepo, invite);
        coachCancels = new CoachCancelService(scheduleRepo, cancelRepo, clock);
        attendance = new AttendanceService(new AttendanceRepository(t.f.clients, t.f.table), scheduleRepo, t.studentRepo, t.coaches,
                cancelRepo, clock);
        payments = new PaymentService(new PaymentRepository(t.f.clients, t.f.table), scheduleRepo, t.studentRepo, t.coaches, clock);

        dana = t.coach("Dana", DANA);
        saveWeek(5000);
        scheduleChange.apply(dana);

        park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of(DANA),
                FamilyTestSupport.kid("Ava Park", DANA), FamilyTestSupport.kid("Jack Park", DANA)));
        chen = FamilyTestSupport.newFamily();
        t.registration.register(chen, "grace@example.com", new RegistrationRequest("Grace", "Chen", "(205) 555-0111", "GUARDIAN",
                List.of(DANA), List.of(FamilyTestSupport.kid("Mia Chen", DANA))));
        ava = id(park, "Ava Park");
        jack = id(park, "Jack Park");
        mia = id(chen, "Mia Chen");
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        t.familySync.issueShareCodes(park.clientId());
        t.familySync.issueShareCodes(chen.clientId());
        miaCode = t.familyService.view(chen).skaters().get(0).shareCode();
        assertThat(drain()).isEmpty(); // signing up and saving a schedule email nobody
    }

    private void saveWeek(int priceMinor) {
        new ScheduleService(scheduleRepo, t.coaches).save(dana, scheduleRepo.findDefault(dana).map(w -> w.scheduleVersion()).orElse(0L),
                List.of(new BlockTemplate(1, "Morning ice", SIX, LocalTime.of(8, 0), 30, priceMinor, 2, IceType.BFSC_FREESTYLE,
                                EnumSet.of(DayOfWeek.MONDAY), Map.of()),
                        new BlockTemplate(2, "Power", SIX, LocalTime.of(7, 0), 30, priceMinor, 1, IceType.BFSC_FREESTYLE,
                                EnumSet.of(DayOfWeek.TUESDAY), Map.of())));
    }

    private String id(ClientContext family, String name) {
        return t.familyService.view(family).skaters().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow().studentId();
    }

    /** A weekly series of {@code weeks} Mondays at 6:00 from MON, shared with {@code shareCode} if given. */
    private void bookSeries(ClientContext family, String studentId, String shareCode, int weeks) {
        booking.book(family, BookingRequest.parse(dana.coachId(), studentId, UUID.randomUUID().toString(),
                List.of(new BookingRequest.PickInput(MON.toString(), "06:00")), true, 1, MON.plusWeeks(weeks - 1).toString()), shareCode);
    }

    private void book(ClientContext family, String studentId, String shareCode, LocalTime at, LocalDate... dates) {
        List<BookingRequest.PickInput> picks = Arrays.stream(dates).map(d -> new BookingRequest.PickInput(d.toString(), at.toString())).toList();
        booking.book(family, BookingRequest.parse(dana.coachId(), studentId, UUID.randomUUID().toString(), picks), shareCode);
    }

    /** What the consumers sent for everything written since the last call, oldest first. */
    private List<Email> drain() {
        router.drain(stream);
        List<Email> out = new ArrayList<>(outbox.list().stream().map(LocalOutbox.Sent::email).toList());
        Collections.reverse(out);
        outbox.clear();
        return out;
    }

    private static Email only(List<Email> emails, String template) {
        List<Email> found = emails.stream().filter(e -> e.template().equals(template)).toList();
        assertThat(found).as(template).hasSize(1);
        return found.get(0);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Email e, String key) {
        return (List<Map<String, Object>>) e.data().get(key);
    }

    // ------------------------------------------------------------------ booking

    @Test
    void bookingTwoDatesSendsOneConfirmationFromTheCoach() {
        book(park, ava, null, SIX, MON, MON.plusWeeks(1));
        Email e = only(drain(), "booking-confirmation");
        assertThat(e.to()).isEqualTo("sarah@example.com");
        assertThat(e.fromName()).isEqualTo("Dana Whitfield via BladeBook");
        assertThat(e.replyTo()).isEqualTo("dana@gmail.com");
        assertThat(e.data()).containsEntry("oneLesson", false).containsEntry("lessonCount", "2").containsEntry("skaterNames", "Ava")
                .containsEntry("firstDate", "Mon, Nov 16").containsEntry("firstTime", "6:00 AM").containsEntry("familyFirst", "Sarah")
                .containsEntry("myBookingsUrl", "https://bladebook.test/family/#/bookings");
        assertThat(list(e, "lessons")).extracting(l -> l.get("price")).containsExactly("$50", "$50");
        assertThat(drain()).isEmpty();
    }

    @Test
    void aConfirmationRefusedIsSentOnTheNextRun() {
        refuse.set(true);
        book(park, ava, null, SIX, MON);
        assertThat(drain()).isEmpty();
        refuse.set(false);
        assertThat(notifications.confirmBookings(dana.coachId(), List.of(com.bladebook.core.domain.Seat.key(MON, SIX, ava)))).isEqualTo(1);
        assertThat(outbox.list()).hasSize(1);
    }

    // --------------------------------------------------------------- cancelling

    @Test
    void aFamilysCancelInTimeEmailsNobody() {
        book(park, ava, null, SIX, MON);
        drain();
        cancels.cancel(park, dana.coachId(), ava, MON, SIX);
        assertThat(drain()).isEmpty();
    }

    @Test
    void aLateCancelEmailsTheCoachsLoginEmail() {
        book(park, ava, null, SIX, MON);
        drain();
        now.set(Instant.parse("2026-11-16T02:00:00Z")); // Sunday 8:00 PM: 10 hours before
        cancels.cancel(park, dana.coachId(), ava, MON, SIX);
        Email e = only(drain(), "coach-late-cancellation");
        assertThat(e.to()).isEqualTo("dana@gmail.com");
        assertThat(e.fromName()).isEqualTo("BladeBook");
        assertThat(e.replyTo()).isNull();
        assertThat(e.data()).containsEntry("skater", "Ava P.").containsEntry("familyName", "Sarah Park").containsEntry("date", "Mon, Nov 16")
                .containsEntry("cancelledAt", "Sun, Nov 15 at 8:00 PM").containsEntry("noticeHours", "24").containsEntry("sharedWith", "")
                .containsEntry("oneLesson", true).containsEntry("lessonCount", "1");
        assertThat(list(e, "lessons")).singleElement().satisfies(l -> assertThat(l).containsEntry("date", "Mon, Nov 16")
                .containsEntry("time", "6:00 AM").containsEntry("skater", "Ava P."));
    }

    @Test
    void theCoachsCancelEmailsEachFamilyOnceAndStampsTheLines() {
        book(park, ava, null, SIX, MON);
        book(chen, mia, null, HALF_SIX, MON);
        drain();
        coachCancels.cancel(dana, CoachCancelRequest.parse("DAY", List.of(new CoachCancelRequest.PickInput(MON.toString(), "06:00", "HOLD"),
                new CoachCancelRequest.PickInput(MON.toString(), "06:30", "RELEASE")), null));
        List<Email> sent = drain();
        assertThat(sent).extracting(Email::template).containsOnly("lesson-cancelled-by-coach");
        assertThat(sent).extracting(Email::to).containsExactlyInAnyOrder("sarah@example.com", "grace@example.com");
        ChangeBatch b = cancelRepo.batches(dana).stream().filter(x -> x.cancelledBy() == ChangeBatch.By.COACH).findFirst().orElseThrow();
        assertThat(notify.batch(dana.coachId(), b.key()).orElseThrow().lines()).extracting(NotifyRepository.LineRow::notificationStatus)
                .containsOnly("SENT");
        assertThat(notifications.changeBatch(dana.coachId(), b.key())).isZero(); // a replay
    }

    @Test
    void aFailedChangeEmailIsMarkedAndSentOnTheRetry() {
        book(park, ava, null, SIX, MON);
        drain();
        refuse.set(true);
        coachCancels.cancel(dana, CoachCancelRequest.parse("LESSON", List.of(new CoachCancelRequest.PickInput(MON.toString(), "06:00", "HOLD")), null));
        assertThat(drain()).isEmpty();
        ChangeBatch b = cancelRepo.batches(dana).get(0);
        assertThat(notify.batch(dana.coachId(), b.key()).orElseThrow().lines().get(0).notificationStatus()).isEqualTo("FAILED");
        refuse.set(false);
        assertThat(notifications.changeBatch(dana.coachId(), b.key())).isEqualTo(1);
        assertThat(notify.batch(dana.coachId(), b.key()).orElseThrow().lines().get(0).notificationStatus()).isEqualTo("SENT");
    }

    @Test
    void aCheaperScheduleTellsTheFamilyTheNewPrice() {
        book(park, ava, null, SIX, MON);
        drain();
        saveWeek(4000);
        scheduleChange.apply(dana);
        Email e = only(drain(), "schedule-change");
        assertThat(e.to()).isEqualTo("sarah@example.com");
        assertThat(list(e, "cancelled")).isEmpty();
        assertThat(list(e, "priceDown")).singleElement().satisfies(l -> {
            assertThat(l).containsEntry("oldPrice", "$50").containsEntry("newPrice", "$40").containsEntry("skater", "Ava");
        });
        assertThat(e.data()).containsEntry("priceDownSummary", "a lesson costs less");
    }

    // --------------------------------------------------------------- attendance

    @Test
    void aCheckInSendsOnePaymentReminderWithTheCoachsPaymentTypes() {
        book(park, ava, null, SIX, MON);
        drain();
        now.set(Instant.parse("2026-11-16T12:05:00Z"));
        attendance.record(dana, MON, SIX, ava, "CHECKED_IN", now.get().toString());
        Email e = only(drain(), "payment-reminder");
        assertThat(e.data()).containsEntry("amount", "$50").containsEntry("skater", "Ava").containsEntry("shared", false)
                .containsEntry("date", "Mon, Nov 16");
        assertThat(list(e, "methods")).singleElement().satisfies(m -> assertThat(m).containsEntry("label", "Venmo").containsEntry("handle", "@dana-skates"));
        payments.markPaid(dana, MON, SIX, ava, "VENMO");
        assertThat(drain()).isEmpty();
    }

    @Test
    void aNoShowSendsNoPaymentReminder() {
        book(park, ava, null, SIX, MON);
        drain();
        now.set(Instant.parse("2026-11-16T12:35:00Z"));
        attendance.record(dana, MON, SIX, ava, "NO_SHOW", now.get().toString());
        assertThat(drain()).isEmpty();
    }

    // ------------------------------------------------------------ scheduled jobs

    @Test
    void theMorningJobRemindsEachFamilyOnceAndEmailsTheCoachOnce() {
        // G-37 (owner, 2026-11-13): one reminder per family per day, listing each of that day's lessons.
        book(park, ava, null, SIX, MON);
        book(park, jack, null, HALF_SIX, MON);
        book(chen, mia, null, LocalTime.of(7, 0), MON);
        drain();
        assertThat(jobs.dayOf(MON)).isEqualTo(new ScheduledJobs.DayOf(2, 1));
        List<Email> sent = drain();
        List<Email> reminders = sent.stream().filter(e -> e.template().equals("day-of-reminder")).toList();
        assertThat(reminders).extracting(Email::to).containsExactlyInAnyOrder("sarah@example.com", "grace@example.com");
        Email toPark = reminders.stream().filter(e -> e.to().equals("sarah@example.com")).findFirst().orElseThrow();
        assertThat(toPark.data()).containsEntry("skaterNames", "Ava and Jack").containsEntry("plural", true).containsEntry("firstTime", "6:00 AM")
                .containsEntry("noticeHours", "24");
        assertThat(list(toPark, "lessons")).extracting(l -> l.get("time") + " " + l.get("skater")).containsExactly("6:00 AM Ava", "6:30 AM Jack");
        Email toChen = reminders.stream().filter(e -> e.to().equals("grace@example.com")).findFirst().orElseThrow();
        assertThat(toChen.data()).containsEntry("skaterNames", "Mia").containsEntry("plural", false);
        assertThat(list(toChen, "lessons")).hasSize(1);
        Email morning = only(sent, "coach-morning");
        assertThat(morning.to()).isEqualTo("dana@gmail.com");
        assertThat(morning.data()).containsEntry("lessonCount", "3").containsEntry("firstTime", "6:00 AM").containsEntry("today", "Mon, Nov 16")
                .containsEntry("rinksideUrl", "https://bladebook.test/coach/rinkside/");
        assertThat(jobs.dayOf(MON)).isEqualTo(new ScheduledJobs.DayOf(0, 0)); // a re-run for the same date
        assertThat(jobs.dayOf(MON.plusDays(1))).isEqualTo(new ScheduledJobs.DayOf(0, 0)); // no lessons: no morning email
    }

    @Test
    void aRefusedReminderIsSentWholeOnTheNextRun() {
        book(park, ava, null, SIX, MON);
        book(park, jack, null, HALF_SIX, MON);
        drain();
        refuse.set(true);
        assertThat(jobs.dayOf(MON)).isEqualTo(new ScheduledJobs.DayOf(0, 0));
        refuse.set(false);
        assertThat(jobs.dayOf(MON)).isEqualTo(new ScheduledJobs.DayOf(1, 1));
        Email e = only(drain(), "day-of-reminder");
        assertThat(list(e, "lessons")).hasSize(2);
    }

    @Test
    void theUnpaidListRepeatsEachMondayUntilPaid() {
        book(park, ava, null, SIX, MON);
        drain();
        assertThat(jobs.unpaid(LocalDate.of(2026, 11, 23))).isEqualTo(new ScheduledJobs.Unpaid(0, 0)); // exactly 7 days: not yet
        assertThat(jobs.unpaid(LocalDate.of(2026, 11, 30))).isEqualTo(new ScheduledJobs.Unpaid(1, 1));
        Email e = only(drain(), "coach-unpaid-weekly");
        assertThat(e.to()).isEqualTo("dana@gmail.com");
        assertThat(e.data()).containsEntry("lessonCount", "1").containsEntry("total", "$50").containsEntry("threshold", "7 days");
        assertThat(list(e, "lessons")).singleElement().satisfies(l -> assertThat(l).containsEntry("note", "Attendance not recorded")
                .containsEntry("skater", "Ava P."));
        assertThat(jobs.unpaid(LocalDate.of(2026, 11, 30))).isEqualTo(new ScheduledJobs.Unpaid(0, 0)); // the same Monday again
        assertThat(jobs.unpaid(LocalDate.of(2026, 12, 7))).isEqualTo(new ScheduledJobs.Unpaid(1, 1));
        now.set(Instant.parse("2026-12-08T15:00:00Z"));
        payments.markPaid(dana, MON, SIX, ava, "VENMO");
        assertThat(jobs.unpaid(LocalDate.of(2026, 12, 14))).isEqualTo(new ScheduledJobs.Unpaid(0, 0));
        payments.undo(dana, MON, SIX, ava);
        assertThat(jobs.unpaid(LocalDate.of(2026, 12, 14))).isEqualTo(new ScheduledJobs.Unpaid(1, 1)); // unpaid again: back on the list
    }

    @Test
    void noThresholdMeansNoUnpaidEmail() {
        book(park, ava, null, SIX, MON);
        ScheduledJobs off = new ScheduledJobs(notify, notifications, scheduleChange, outbox, null);
        assertThat(off.unpaid(LocalDate.of(2026, 11, 30))).isEqualTo(new ScheduledJobs.Unpaid(0, 0));
    }

    @Test
    void theRollerAddsOnlyWhatsMissing() {
        ScheduledJobs.Rolled first = jobs.roll(LocalDate.of(2026, 12, 1));
        assertThat(first.coaches()).isEqualTo(1);
        assertThat(first.added()).isPositive(); // February 2028 comes into what's stored
        assertThat(jobs.roll(LocalDate.of(2026, 12, 1)).added()).isZero();
    }

    // ------------------------------------------------------------- shared lessons

    @Test
    void anInvitationThenAJoinEmailBothFamilies() {
        book(park, ava, miaCode, SIX, MON);
        List<Email> sent = drain();
        assertThat(only(sent, "booking-confirmation").to()).isEqualTo("sarah@example.com");
        Email inv = only(sent, "share-invitation");
        assertThat(inv.to()).isEqualTo("grace@example.com");
        assertThat(inv.data()).containsEntry("inviterName", "Sarah Park").containsEntry("inviterSkater", "Ava").containsEntry("skater", "Mia")
                .containsEntry("share", "$25").containsEntry("fullPrice", "$50");
        assertThat((String) inv.data().get("invitationUrl")).startsWith("https://bladebook.test/family/#/invite/");

        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
        sent = drain();
        assertThat(sent).extracting(Email::template).containsOnly("share-joined");
        assertThat(sent).hasSize(2);
        Email toGrace = sent.stream().filter(e -> e.to().equals("grace@example.com")).findFirst().orElseThrow();
        Email toSarah = sent.stream().filter(e -> e.to().equals("sarah@example.com")).findFirst().orElseThrow();
        assertThat(toGrace.data()).containsEntry("isInviter", false).containsEntry("skater", "Mia").containsEntry("otherSkater", "Ava")
                .containsEntry("share", "$25");
        assertThat(toSarah.data()).containsEntry("isInviter", true).containsEntry("otherFamily", "Grace Chen").containsEntry("share", "$25");
    }

    @Test
    void aSharedSeriesSendsOneInvitationAndOneJoinedEmailEachListingEveryDate() {
        // G-38 (owner, 2026-11-13): one email per invitation and per answer, listing the dates.
        bookSeries(park, ava, miaCode, 3);
        List<Email> sent = drain();
        Email inv = only(sent, "share-invitation");
        assertThat(inv.data()).containsEntry("oneLesson", false).containsEntry("lessonCount", "3").containsEntry("date", "Mon, Nov 16")
                .containsEntry("share", "$25");
        assertThat(list(inv, "lessons")).extracting(l -> l.get("date")).containsExactly("Mon, Nov 16", "Mon, Nov 23", "Mon, Nov 30");
        assertThat(list(inv, "lessons")).allSatisfy(l -> assertThat(l).containsEntry("time", "6:00 AM").containsEntry("share", "$25"));

        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
        sent = drain();
        assertThat(sent).extracting(Email::template).containsOnly("share-joined");
        assertThat(sent).extracting(Email::to).containsExactlyInAnyOrder("grace@example.com", "sarah@example.com");
        assertThat(sent).allSatisfy(e -> {
            assertThat(e.data()).containsEntry("oneLesson", false).containsEntry("lessonCount", "3");
            assertThat(list(e, "lessons")).hasSize(3);
        });
        assertThat(drain()).isEmpty();
    }

    @Test
    void aDeclinedSeriesInvitationIsOneEmail() {
        bookSeries(park, ava, miaCode, 2);
        drain();
        shares.decline(chen, shares.invitations(chen).get(0).inviteId());
        Email e = only(drain(), "share-invitation-declined");
        assertThat(e.data()).containsEntry("oneLesson", false).containsEntry("lessonCount", "2");
        assertThat(list(e, "lessons")).extracting(l -> l.get("date")).containsExactly("Mon, Nov 16", "Mon, Nov 23");
    }

    @Test
    void aWithdrawnSeriesInvitationIsOneEmail() {
        bookSeries(park, ava, miaCode, 2);
        drain();
        shares.withdraw(park, shares.invitations(chen).get(0).inviteId());
        Email e = only(drain(), "share-invitation-withdrawn");
        assertThat(e.to()).isEqualTo("grace@example.com");
        assertThat(list(e, "lessons")).hasSize(2);
    }

    @Test
    void stoppingASharedSeriesAsksTheStayingFamilyOnceForEveryDate() {
        bookSeries(park, ava, miaCode, 3);
        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
        drain();
        String rid = booking.myBookings(park).series().get(0).recurrence().recurrenceId();
        series.change(park, dana.coachId(), rid, "STOP", null, null);
        Email ask = only(drain(), "share-other-cant-make-it");
        assertThat(ask.to()).isEqualTo("grace@example.com");
        assertThat(ask.data()).containsEntry("oneLesson", false).containsEntry("lessonCount", "3").containsEntry("skater", "Mia")
                .containsEntry("otherSkater", "Ava P.").containsEntry("date", "Mon, Nov 16");
        assertThat(list(ask, "lessons")).extracting(l -> l.get("date")).containsExactly("Mon, Nov 16", "Mon, Nov 23", "Mon, Nov 30");
        assertThat(list(ask, "lessons")).allSatisfy(l -> assertThat((String) l.get("answerBy")).isNotEmpty());
        assertThat(ask.data().get("answerBy")).isEqualTo(list(ask, "lessons").get(0).get("answerBy"));
        assertThat(drain()).isEmpty();
    }

    @Test
    void aDeclineTellsTheInvitingFamily() {
        book(park, ava, miaCode, SIX, MON);
        drain();
        shares.decline(chen, shares.invitations(chen).get(0).inviteId());
        Email e = only(drain(), "share-invitation-declined");
        assertThat(e.to()).isEqualTo("sarah@example.com");
        assertThat(e.data()).containsEntry("inviteeName", "Grace Chen").containsEntry("inviteeSkater", "Mia").containsEntry("skater", "Ava")
                .containsEntry("price", "$50");
    }

    @Test
    void aWithdrawalTellsTheInvitedFamily() {
        book(park, ava, miaCode, SIX, MON);
        drain();
        shares.withdraw(park, shares.invitations(chen).get(0).inviteId());
        Email e = only(drain(), "share-invitation-withdrawn");
        assertThat(e.to()).isEqualTo("grace@example.com");
        assertThat(e.data()).containsEntry("inviterName", "Sarah Park").containsEntry("skater", "Mia");
    }

    @Test
    void anInvitationUnansweredAtTheStartIsNoLongerAvailable() {
        book(park, ava, miaCode, SIX, MON);
        drain();
        now.set(Instant.parse("2026-11-16T12:00:00Z"));
        sweep.sweep(now.get());
        Email e = only(drain(), "share-no-longer-available");
        assertThat(e.to()).isEqualTo("grace@example.com");
    }

    @Test
    void aLeaveInTimeAsksTheStayingFamilyThenTheSweepCancels() {
        book(park, ava, miaCode, SIX, MON);
        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
        drain();
        now.set(Instant.parse("2026-11-12T15:00:00Z")); // Thursday: in time
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);
        Email ask = only(drain(), "share-other-cant-make-it");
        assertThat(ask.to()).isEqualTo("sarah@example.com");
        assertThat(ask.data()).containsEntry("skater", "Ava").containsEntry("otherSkater", "Mia C.").containsEntry("fullPrice", "$50")
                .containsEntry("share", "$25").containsEntry("answerBy", "Sun, Nov 15 at 6:00 AM").containsEntry("oneLesson", true)
                .containsEntry("date", "Mon, Nov 16");
        assertThat(list(ask, "lessons")).singleElement().satisfies(l -> assertThat(l).containsEntry("answerBy", "Sun, Nov 15 at 6:00 AM"));
        assertThat(drain()).isEmpty();

        now.set(Instant.parse("2026-11-15T13:00:00Z")); // past the answer-by time
        sweep.sweep(now.get());
        Email gone = only(drain(), "share-cancelled-no-answer");
        assertThat(gone.to()).isEqualTo("sarah@example.com");
        assertThat(gone.data()).containsEntry("otherSkater", "Mia C.").containsEntry("answerBy", "Sun, Nov 15 at 6:00 AM");
    }

    @Test
    void theStayingFamilysCancelEmailsThemTheDatesAndNotTheCoach() {
        book(park, ava, miaCode, SIX, MON);
        shares.accept(chen, shares.invitations(chen).get(0).inviteId());
        now.set(Instant.parse("2026-11-12T15:00:00Z"));
        cancels.cancel(chen, dana.coachId(), mia, MON, SIX);
        drain();
        cancels.cancelWaiting(park, dana.coachId(), ava, List.of(MON), SIX);
        List<Email> sent = drain();
        Email e = only(sent, "share-dates-cancelled");
        assertThat(e.to()).isEqualTo("sarah@example.com");
        assertThat(e.data()).containsEntry("lessonCount", "1").containsEntry("skater", "Ava");
        assertThat(sent).extracting(Email::template).doesNotContain("coach-late-cancellation");
    }

    // ------------------------------------------------------------------ decline

    @Test
    void aDeclinedSignUpIsTold() {
        ClientContext lee = FamilyTestSupport.newFamily();
        t.registration.register(lee, "lee@example.com", new RegistrationRequest("Kim", "Lee", "(205) 555-0122", "GUARDIAN", List.of(DANA),
                List.of(FamilyTestSupport.kid("Sam Lee", DANA))));
        StudentRecord before = t.studentRepo.list(dana).stream().filter(r -> r.studentName().equals("Sam Lee")).findFirst().orElseThrow();
        assertThat(notifications.declined(before)).isTrue();
        Email e = outbox.list().get(0).email();
        assertThat(e.template()).isEqualTo("signup-declined");
        assertThat(e.to()).isEqualTo("lee@example.com");
        assertThat(e.data()).containsEntry("coachName", "Dana Whitfield").containsEntry("skater", "Sam").containsEntry("familyFirst", "Kim");
    }
}
