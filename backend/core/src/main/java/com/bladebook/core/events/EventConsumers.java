package com.bladebook.core.events;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.AccessLog;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CloudWatchAccessLog;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.data.TableRecord;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.service.FamilySyncService;
import com.bladebook.core.service.InviteSyncService;
import com.bladebook.core.service.Mailer;
import com.bladebook.core.service.NotificationService;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.SesMailer;
import com.bladebook.core.service.StudentLinkService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

/**
 * What each event consumer does with its event (ADR-MASTER sections 2 and 3): one method per named event, each reading
 * the stream record the Pipe put on the bus and calling the core service the API calls in-process locally
 * ({@code LocalEventDispatcher}, {@code LocalStreamRouter}). The {@code consumers} module's handlers are one line each.
 *
 * <p>Each service re-reads what it needs and checks its own guard, so an event delivered twice, or a consumer's own write
 * coming back as an event, does nothing more.
 *
 * <p>Each event that reads personal data writes one access-log line (ADR-MASTER section 18; owner, 2026-11-17, I21): the
 * function, the event, the IDs it was about and the names of the fields it read for it. Written when the event's work is
 * done, or has failed; if that write fails the event fails, and the retry finds the guards already set. An email not
 * accepted ({@link com.bladebook.core.service.EmailNotAccepted}) fails the event too, with its guard given back, so the
 * retry sends it (ADR-MASTER section 19).
 */
public final class EventConsumers {

    /** The named events (ADR-MASTER section 3). Each is an EventBridge rule of the same name. */
    public enum Event {
        LessonBooked, CheckInRecorded, ScheduleChanged, LessonsChanged, StudentChanged, FamilyChanged, SharedLessonChanged
    }

    /** What one event did: counts only, for the function's own log (never names or addresses). */
    public record Outcome(Event event, String what, int count) {
    }

    /** The personal-data fields each event's work reads, named once on its access-log line. */
    static final Map<Event, List<String>> FIELDS = Map.of(
            Event.LessonBooked, List.of("businessEmail", "clientEmail", "clientName", "studentName"),
            Event.CheckInRecorded, List.of("businessEmail", "cashappHandle", "clientEmail", "clientName", "paymentInstructions",
                    "paypalHandle", "studentName", "venmoHandle"),
            Event.ScheduleChanged, List.of("studentName"),
            Event.LessonsChanged, List.of("businessEmail", "clientEmail", "clientName", "loginEmail", "studentName"),
            Event.StudentChanged, List.of("clientEmail", "clientName", "studentName"),
            Event.FamilyChanged, List.of("clientEmail", "clientName", "clientPhone", "clientRelationship", "isMinor",
                    "registrationNumber", "skatingOrg", "studentName"),
            Event.SharedLessonChanged, List.of("businessEmail", "clientEmail", "clientName", "partnerName", "studentName"));

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final String function;
    private final NotificationService notifications;
    private final ScheduleChangeService scheduleChange;
    private final StudentLinkService studentLink;
    private final FamilySyncService familySync;
    private final InviteSyncService inviteSync;

    public EventConsumers(String function, TenantClients clients, String table, Mailer mailer, NotificationService.Links links,
                          Clock clock) {
        this.function = function;
        this.notifications = new NotificationService(new NotifyRepository(clients, table), mailer, links, clock);
        this.scheduleChange = new ScheduleChangeService(new ScheduleRepository(clients, table),
                new CoachRepository(clients, table), clock);
        SyncRepository sync = new SyncRepository(clients, table);
        this.studentLink = new StudentLinkService(sync, clock);
        this.familySync = new FamilySyncService(sync);
        this.inviteSync = new InviteSyncService(new ShareRepository(clients, table));
    }

    /**
     * On Lambda, from the function's environment (set by {@code infra/lib/consumers.ts}). A function with no sending
     * addresses sends nothing ({@link Mailer#none}), and its events still succeed.
     */
    public static EventConsumers fromEnvironment() {
        return fromEnvironment(System::getenv);
    }

    static EventConsumers fromEnvironment(Function<String, String> env) {
        String function = required(env, "AWS_LAMBDA_FUNCTION_NAME");
        AccessLog.install(CloudWatchAccessLog.aws(required(env, "BLADEBOOK_ACCESSLOGGROUP"), function), Clock.systemUTC());
        String from = env.apply("BLADEBOOK_MAIL_FROM");
        Mailer mailer = from == null || from.isBlank() ? Mailer.none(function)
                : SesMailer.aws(new SesMailer.Senders(from, required(env, "BLADEBOOK_MAIL_NOREPLY")));
        return new EventConsumers(function, TenantClients.consumer(), required(env, "BLADEBOOK_TABLE"), mailer,
                new NotificationService.Links(required(env, "BLADEBOOK_COACHSITEURL"), required(env, "BLADEBOOK_FAMILYSITEURL")),
                Clock.systemUTC());
    }

    private static String required(Function<String, String> env, String name) {
        String v = env.apply(name);
        if (v == null || v.isBlank()) {
            throw new IllegalStateException(name + " is not set");
        }
        return v;
    }

    /**
     * One delivery: the event as EventBridge hands it to the function. Its access-log line is written before this returns;
     * a failure throws, so Lambda retries and then puts the event on the function's dead-letter queue.
     */
    public Outcome run(Event event, String json, String requestId) {
        String coach = reconcileRequest(json);
        if (coach != null) {
            if (event != Event.ScheduleChanged) {
                throw new IllegalArgumentException("only consumer-schedule-change reconciles");
            }
            return reconcile(coach, requestId);
        }
        TableRecord r = TableRecord.parse(json);
        AccessLog.begin(requestId, null);
        RuntimeException failure = null;
        try {
            Outcome o;
            try {
                o = handle(event, r);
            } catch (RuntimeException e) {
                // It may have read what it needed before failing (an email not accepted, say), or nothing (its first read
                // throttled): the line is still written, marked failed, then the event fails and is retried.
                failure = e;
                AccessLog.consumerRun(function, event.name(), ids(r), FIELDS.get(event), true);
                throw e;
            }
            if (o.count() >= 0) {
                AccessLog.consumerRun(function, event.name(), ids(r), FIELDS.get(event));
            }
            return o;
        } finally {
            endKeeping(failure);
        }
    }

    /** Writes the run's access-log lines; if that fails too, the run's own failure is the one thrown, carrying it. */
    static void endKeeping(RuntimeException failure) {
        try {
            AccessLog.end();
        } catch (RuntimeException logFailed) {
            if (failure == null) {
                throw logFailed;
            }
            failure.addSuppressed(logFailed);
        }
    }

    /** {@code {"reconcile": "<coachId>"}}: a direct invocation, not an event; else null. */
    static String reconcileRequest(String json) {
        JsonNode n = JSON.readTree(Objects.requireNonNull(json, "json"));
        return n.has("reconcile") ? n.get("reconcile").asString() : null;
    }

    /**
     * {@code consumer-schedule-change} invoked directly, by {@code sched-drift-check} or the {@code reconcile-schedule}
     * command (ADR-MASTER section 19): settles the coach's stuck batches, then writes any difference as a {@code RECONCILE}
     * batch. Its access-log line is the schedule change's.
     */
    Outcome reconcile(String coachId, String requestId) {
        AccessContext ctx = new AccessContext(coachId);
        AccessLog.begin(requestId, null);
        AccessLog.Ids ids = new AccessLog.Ids().add("coachId", coachId);
        RuntimeException failure = null;
        try {
            ScheduleChangeService.Reconciled r = scheduleChange.reconcile(ctx);
            AccessLog.consumerRun(function, "reconcile", ids, FIELDS.get(Event.ScheduleChanged));
            return new Outcome(Event.ScheduleChanged, "batches settled, then lessons cancelled or re-priced",
                    r.settled() + r.result().cancelled() + r.result().repriced());
        } catch (RuntimeException e) {
            failure = e;
            AccessLog.consumerRun(function, "reconcile", ids, FIELDS.get(Event.ScheduleChanged), true);
            throw e;
        } finally {
            endKeeping(failure);
        }
    }

    /** A count of -1: the record wasn't one this event acts on, so nothing was read. */
    Outcome handle(Event event, TableRecord r) {
        String coachId = r.partitionId();
        return switch (event) {
            case LessonBooked -> r.pk().startsWith("COACH#") && r.sk().startsWith(BookingRepository.BOOKED) && r.hasNewImage()
                    ? new Outcome(event, "confirmations sent", notifications.confirmBooking(coachId, r.sk()))
                    : skipped(event);
            case CheckInRecorded -> onCoachSeat(r, event, "reminders sent",
                    () -> notifications.paymentReminder(coachId, r.sk()) ? 1 : 0);
            case ScheduleChanged -> scheduleChanged(r);
            case LessonsChanged -> r.pk().startsWith("COACH#") && r.sk().startsWith("CHANGEBATCH#")
                    ? new Outcome(event, "emails sent", notifications.changeBatch(coachId, r.sk()))
                    : skipped(event);
            case StudentChanged -> studentChanged(r);
            case FamilyChanged -> familyChanged(r);
            case SharedLessonChanged -> sharedLessonChanged(r);
        };
    }

    private Outcome onCoachSeat(TableRecord r, Event event, String what, java.util.function.IntSupplier run) {
        if (!r.pk().startsWith("COACH#") || !r.sk().startsWith("SEAT#")) {
            return skipped(event);
        }
        return new Outcome(event, what, run.getAsInt());
    }

    private Outcome scheduleChanged(TableRecord r) {
        if (!r.pk().startsWith("COACH#")) {
            return skipped(Event.ScheduleChanged);
        }
        ChangeBatch.Source source;
        if (r.sk().equals("SCHEDULE#DEFAULT")) {
            source = ChangeBatch.Source.DEFAULT;
        } else if (r.sk().startsWith("SCHEDULE#DATE#")) {
            source = ChangeBatch.Source.DATE_OVERRIDE;
        } else {
            return skipped(Event.ScheduleChanged);
        }
        // The event's id, so a retry of a run that stopped takes its own lease back (ScheduleChangeService#apply).
        AccessContext ctx = new AccessContext(r.partitionId());
        ScheduleChangeService.Result res = r.eventId() == null ? scheduleChange.apply(ctx, source)
                : scheduleChange.apply(ctx, source, ChangeBatch.By.SCHEDULE_CHANGE, r.eventId());
        return new Outcome(Event.ScheduleChanged, "lessons cancelled or re-priced", res.cancelled() + res.repriced());
    }

    /**
     * Mirrors the coach's two actions on a {@code PENDING} skater: approving it ({@code ACTIVE}) updates the family's link;
     * declining it (the record removed) removes the link and emails the family. Anything else is no change of standing.
     */
    private Outcome studentChanged(TableRecord r) {
        Optional<StudentRecord> before = r.oldStudent();
        Optional<StudentRecord> after = r.newStudent();
        if (after.isPresent() && after.get().status() == StudentStatus.ACTIVE
                && before.map(b -> b.status() == StudentStatus.PENDING).orElse(true)) {
            studentLink.approved(after.get());
            return new Outcome(Event.StudentChanged, "links approved", 1);
        }
        if (after.isEmpty() && before.isPresent() && before.get().status() == StudentStatus.PENDING) {
            // The email is claimed on the family's link and sent before the link goes (StudentLinkService#declined).
            StudentRecord b = before.get();
            return new Outcome(Event.StudentChanged, "decline emails sent",
                    studentLink.declined(b, giveBack -> notifications.declined(b, giveBack)) ? 1 : 0);
        }
        return skipped(Event.StudentChanged);
    }

    private Outcome familyChanged(TableRecord r) {
        if (!r.pk().startsWith("CLIENT#") || !(r.sk().equals("PROFILE") || r.sk().startsWith("SKATER#")) || !r.hasNewImage()) {
            return skipped(Event.FamilyChanged);
        }
        String clientId = r.partitionId();
        return new Outcome(Event.FamilyChanged, "coach records updated and share codes issued",
                familySync.familyChanged(clientId) + familySync.issueShareCodes(clientId));
    }

    /** A seat, an ended invitation or a lesson time's {@code pendingLeave}: that lesson's copies, then its emails. */
    private Outcome sharedLessonChanged(TableRecord r) {
        if (r.pk().startsWith("COACH#") && r.sk().startsWith(BookingRepository.ENDED)) {
            String[] m = r.sk().split("#");
            return r.hasNewImage() && m.length == 4
                    ? new Outcome(Event.SharedLessonChanged, "emails sent",
                            notifications.endedFor(r.partitionId(), m[2], ShareRepository.Ended.valueOf(m[3])))
                    : skipped(Event.SharedLessonChanged);
        }
        boolean booked = r.sk().startsWith(BookingRepository.BOOKED);
        if (r.pk().startsWith("COACH#") && (booked || r.sk().startsWith(BookingRepository.JOINED))) {
            return r.hasNewImage() ? marker(r.partitionId(), r.sk(), booked) : skipped(Event.SharedLessonChanged);
        }
        String[] p = r.sk().split("#");
        boolean lessonKey = r.sk().startsWith("SEAT#") || r.sk().startsWith("SEATEND#") || r.sk().startsWith("LESSON#");
        if (!r.pk().startsWith("COACH#") || !lessonKey || p.length < 3) {
            return skipped(Event.SharedLessonChanged);
        }
        LocalDate date = LocalDate.parse(p[1]);
        LocalTime start = LocalTime.parse(p[2]);
        inviteSync.seatsChanged(r.partitionId(), date, start);
        return new Outcome(Event.SharedLessonChanged, "emails sent", notifications.sharedLesson(r.partitionId(), date, start));
    }

    /**
     * A booking request's or an accepted invitation's marker: its dates' copies first (each date's own event may not have run
     * yet), then one email for every date: the booking's invitation, or "joined" to both families (owner, 2026-11-25).
     */
    private Outcome marker(String coachId, String markerKey, boolean booked) {
        Set<String> lessons = new LinkedHashSet<>();
        for (String seat : notifications.bookedSeatKeys(coachId, markerKey)) {
            String[] p = seat.split("#");
            if (p.length >= 4 && lessons.add(p[1] + "#" + p[2])) {
                inviteSync.seatsChanged(coachId, LocalDate.parse(p[1]), LocalTime.parse(p[2]));
            }
        }
        return booked
                ? new Outcome(Event.SharedLessonChanged, "invitations sent", notifications.bookingInvitations(coachId, markerKey))
                : new Outcome(Event.SharedLessonChanged, "joined emails sent", notifications.joinedFor(coachId, markerKey));
    }

    private static Outcome skipped(Event event) {
        return new Outcome(event, "not this event's record", -1);
    }

    /** What the line is about: the partition's coach or family, and the skater and family the item names. */
    static AccessLog.Ids ids(TableRecord r) {
        AccessLog.Ids ids = new AccessLog.Ids();
        ids.add(r.pk().startsWith("CLIENT#") ? "clientId" : "coachId", r.partitionId());
        for (String kind : List.of("studentId", "clientId")) {
            ids.add(kind, r.newString(kind).or(() -> r.oldString(kind)).orElse(null));
        }
        return ids;
    }
}
