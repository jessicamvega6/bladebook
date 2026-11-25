package com.bladebook.core.data;

import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.RepriceLine;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.StudentRecord;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.dynamodb.model.Select;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * What the notification consumers and the 7am and Monday jobs read and write (ADR-MASTER sections 13 and 14), as their own
 * roles: {@code consumer-change-notifier}, {@code consumer-booking-confirmation}, {@code consumer-payment-reminder},
 * {@code consumer-invite}'s emails, {@code consumer-student-link}'s decline, {@code sched-day-reminder} and
 * {@code sched-unpaid-reminder}. Every email has a guard on the record it's about, set here with a conditional write, so a
 * replay or a second run sends nothing twice (section 19, "Every event consumer").
 */
public final class NotifyRepository {

    /** A seat with its payment status and the guard attributes the emails set on it. */
    public record SeatRow(Seat seat, String paymentStatus, Map<String, String> guards) {

        /** Whether that guard's email has gone: set, and not a claim still {@code PENDING}. */
        public boolean has(String guard) {
            String v = guards.get(guard);
            return v != null && !v.startsWith(PENDING);
        }

        public String guard(String name) {
            return guards.get(name);
        }
    }

    /** A pending leave on a lesson time, with whether the staying family has been emailed. */
    public record LeaveRow(ShareRepository.PendingLeave leave, boolean emailed) {
    }

    /** An ended invitation, {@code SEATEND#…}. {@code clientId}: the invited family's, when they were known. */
    public record EndRow(String sk, ShareRepository.Ended outcome, String studentId, String studentName, String clientId,
                         String invitedByClientId, String inviteId, Instant endedAt, boolean emailed) {
    }

    /** A cancellation line with its notification state ({@code notificationStatus} is {@code null} until notified). */
    public record LineRow(String sk, CancellationLine line, String notificationStatus, String skippedReason) {
    }

    /** A re-price line with its notification state. */
    public record RepriceRow(String sk, RepriceLine line, String notificationStatus) {
    }

    /** A change batch's header and every line in it. */
    public record BatchRow(ChangeBatch batch, List<LineRow> lines, List<RepriceRow> reprices) {
    }

    /** The guards on a seat (ADR-MASTER sections 7, 12 and 13). Not in the ADR's list: the invitation and joined guards. */
    public static final String CONFIRMATION_SENT = "confirmationSent";
    public static final String PAYMENT_REMINDER_SENT = "paymentReminderSent";
    public static final String REMINDED_ON = "remindedOn";
    public static final String SETTLE_REMINDER_SENT_ON = "settleReminderSentOn";
    public static final String INVITE_EMAIL_SENT = "inviteEmailSent";
    /** "Joined" to the family who joined; {@link #JOINED_HOST_EMAIL_SENT} to the family whose lesson it is (2026-11-23). */
    public static final String JOINED_EMAIL_SENT = "joinedEmailSent";
    public static final String JOINED_HOST_EMAIL_SENT = "joinedHostEmailSent";
    /** On the coach's profile. */
    public static final String MORNING_EMAIL_SENT_ON = "morningEmailSentOn";

    private static final List<String> SEAT_GUARDS = List.of(CONFIRMATION_SENT, PAYMENT_REMINDER_SENT, REMINDED_ON,
            SETTLE_REMINDER_SENT_ON, INVITE_EMAIL_SENT, JOINED_EMAIL_SENT, JOINED_HOST_EMAIL_SENT);

    private final TenantClients clients;
    private final String table;

    public NotifyRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // ------------------------------------------------------------------- people

    public Optional<CoachProfile> coach(String coachId) {
        return get("COACH#" + coachId, "PROFILE").map(CoachRepository::fromItem);
    }

    public Optional<FamilyProfile> family(String clientId) {
        return get("CLIENT#" + clientId, FamilyItems.PROFILE).map(FamilyItems::profile);
    }

    /** The coach's copy of a skater and their family's contact details. */
    public Optional<StudentRecord> student(String coachId, String studentId) {
        return get("COACH#" + coachId, FamilyItems.STUDENT + studentId).map(FamilyItems::student);
    }

    /**
     * Every coach with a profile, for the roller and the year close. Reads the keys only: their roles may scan nothing
     * else (ADR-MASTER section 2), and the profiles hold personal data the jobs don't need.
     */
    public List<String> coachIds() {
        List<String> out = new ArrayList<>();
        scan("begins_with(PK, :c) AND SK = :p", Map.of(":c", FamilyItems.s("COACH#"), ":p", FamilyItems.s("PROFILE")), null, true,
                m -> out.add(m.get("PK").s().substring("COACH#".length())));
        return out;
    }

    // -------------------------------------------------------------- lessons and seats

    public Optional<SeatRow> seat(String coachId, String seatKey) {
        return get("COACH#" + coachId, seatKey).map(NotifyRepository::seatRow);
    }

    /** The seat keys a booking request's marker lists ({@link BookingRepository#markBooked}); empty if it's gone. */
    public List<String> bookedSeatKeys(String coachId, String markerKey) {
        return get("COACH#" + coachId, markerKey)
                .map(m -> m.containsKey("seatKeys") ? m.get("seatKeys").l().stream().map(AttributeValue::s).toList() : List.<String>of())
                .orElse(List.of());
    }

    /** Every seat of one lesson time, invited ones included. */
    public List<SeatRow> seatsAt(String coachId, LocalDate date, LocalTime start) {
        return queryPrefix("COACH#" + coachId, SeatItems.SEAT + date + "#" + start + "#").stream().map(NotifyRepository::seatRow).toList();
    }

    public Optional<LessonTime> lesson(String coachId, LocalDate date, LocalTime start) {
        return get("COACH#" + coachId, LessonTime.key(date, start)).map(ScheduleRepository::lessonFrom);
    }

    public Optional<LeaveRow> pendingLeave(String coachId, LocalDate date, LocalTime start) {
        return get("COACH#" + coachId, LessonTime.key(date, start)).filter(m -> m.containsKey("pendingLeave")).map(m -> {
            Map<String, AttributeValue> p = m.get("pendingLeave").m();
            return new LeaveRow(new ShareRepository.PendingLeave(FamilyItems.str(p, "leaveId"), FamilyItems.str(p, "leftStudentId"),
                    FamilyItems.str(p, "leftStudentName"), Instant.parse(FamilyItems.str(p, "leftAt")),
                    FamilyItems.str(p, "stayingStudentId"), Instant.parse(FamilyItems.str(p, "answerBy"))),
                    sent(p.get("emailSent")));
        });
    }

    public List<EndRow> endings(String coachId, LocalDate date, LocalTime start) {
        return queryPrefix("COACH#" + coachId, ShareRepository.SEATEND + date + "#" + start + "#").stream()
                .map(NotifyRepository::endRow).toList();
    }

    private static EndRow endRow(Map<String, AttributeValue> m) {
        return new EndRow(m.get("SK").s(), ShareRepository.Ended.valueOf(FamilyItems.str(m, "seatOutcome")),
                FamilyItems.str(m, "studentId"), FamilyItems.str(m, "studentName"), FamilyItems.str(m, "clientId"),
                FamilyItems.str(m, "invitedByClientId"), FamilyItems.str(m, "inviteId"), Instant.parse(FamilyItems.str(m, "endedAt")),
                sent(m.get("emailSent")));
    }

    /**
     * One invitation's seats with one coach, every date (G-38: one email per invitation, not per date): the family's seats
     * through GSI1, kept to {@code coachId} and {@code inviteId}. Invited seats are on GSI1 once {@code consumer-invite} has
     * named their family, and joined ones always are. The index can lag a write, so each email is still decided by the
     * conditional guard write on the seat itself, never by what this read says.
     */
    public List<SeatRow> inviteSeats(String clientId, String coachId, String inviteId) {
        List<SeatRow> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db().query(QueryRequest.builder().tableName(table).indexName(LocalTable.GSI1)
                    .keyConditionExpression("GSI1PK = :pk AND begins_with(GSI1SK, :s)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s("CLIENT#" + clientId), ":s", FamilyItems.s(SeatItems.SEAT)))
                    .exclusiveStartKey(start).build());
            r.items().stream().map(NotifyRepository::seatRow)
                    .filter(x -> coachId.equals(x.seat().coachId()) && inviteId.equals(x.seat().share().inviteId()))
                    .forEach(out::add);
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /** Every ended invitation of one invitation, any date (G-38), with the same outcome. */
    public List<EndRow> endingsOf(String coachId, String inviteId, ShareRepository.Ended outcome) {
        return queryPrefix("COACH#" + coachId, ShareRepository.SEATEND).stream().map(NotifyRepository::endRow)
                .filter(e -> inviteId.equals(e.inviteId()) && e.outcome() == outcome).toList();
    }

    /** GSI2: every seat that will happen on {@code date} (the coach's local date), across coaches. */
    public List<SeatRow> seatsOn(LocalDate date) {
        List<SeatRow> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db().query(QueryRequest.builder().tableName(table).indexName(LocalTable.GSI2)
                    .keyConditionExpression("GSI2PK = :d").expressionAttributeValues(Map.of(":d", FamilyItems.s("DATE#" + date)))
                    .exclusiveStartKey(start).build());
            r.items().forEach(m -> out.add(seatRow(m)));
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    /** GSI3, scanned (ADR-MASTER section 2): every seat still unpaid, across coaches. */
    public List<SeatRow> unpaid() {
        List<SeatRow> out = new ArrayList<>();
        scan(null, Map.of(), LocalTable.GSI3, false, m -> out.add(seatRow(m)));
        return out;
    }

    // ---------------------------------------------------------------- change batches

    /** A header and its lines, or empty when the header isn't there. */
    public Optional<BatchRow> batch(String coachId, String batchSk) {
        return get("COACH#" + coachId, batchSk).map(h -> {
            ChangeBatch b = CancellationItems.batch(h);
            String suffix = b.stamp() + "#" + b.batchId() + "#";
            List<LineRow> lines = queryPrefix("COACH#" + coachId, CancellationItems.LINE + suffix).stream()
                    .map(m -> new LineRow(m.get("SK").s(), CancellationItems.lineFrom(m), FamilyItems.str(m, "notificationStatus"),
                            FamilyItems.str(m, "skippedReason")))
                    .toList();
            List<RepriceRow> reprices = queryPrefix("COACH#" + coachId, CancellationItems.REPRICED + suffix).stream()
                    .map(m -> new RepriceRow(m.get("SK").s(), CancellationItems.repriceFrom(m), FamilyItems.str(m, "notificationStatus")))
                    .toList();
            return new BatchRow(b, lines, reprices);
        });
    }

    /**
     * A {@code PENDING} claim older than this belongs to a run that stopped mid-send: {@code consumer-change-notifier} times
     * out after a minute (infra/lib/consumers.ts), so no live run holds one this old (2026-11-23).
     */
    public static final Duration LINE_CLAIM_ABANDONED = Duration.ofMinutes(2);

    /** What became of a claim on a recipient's lead line. */
    public enum LineClaim {
        /** This run holds it: send. */
        CLAIMED,
        /** Another run claimed it under {@link #LINE_CLAIM_ABANDONED} ago and may still be sending: fail, so the event is retried. */
        IN_PROGRESS,
        /** Sent or refused already, or the line is gone: nothing to do. */
        DONE
    }

    /**
     * Claims one recipient's email of a batch: its lead line becomes {@code PENDING} with {@code claimedAt} (ADR-MASTER
     * section 13, "Notification state"), if it has no state yet or its claim was abandoned by a run that stopped. A run
     * that stopped mid-send may have sent it, so the retry can send it a second time; never not at all.
     */
    public LineClaim claimLine(String coachId, String sk, Instant now) {
        Map<String, AttributeValue> key = FamilyItems.key("COACH#" + coachId, sk);
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(key)
                    .conditionExpression("attribute_exists(SK) AND (attribute_not_exists(notificationStatus) OR "
                            + "(notificationStatus = :p AND (attribute_not_exists(claimedAt) OR claimedAt <= :stale)))")
                    .updateExpression("SET notificationStatus = :p, claimedAt = :now")
                    .expressionAttributeValues(Map.of(":p", FamilyItems.s("PENDING"), ":now", FamilyItems.s(sortable(now)),
                            ":stale", FamilyItems.s(sortable(now.minus(LINE_CLAIM_ABANDONED)))))
                    .build());
            return LineClaim.CLAIMED;
        } catch (ConditionalCheckFailedException e) {
            Map<String, AttributeValue> line = db().getItem(GetItemRequest.builder().tableName(table).key(key).consistentRead(true).build()).item();
            boolean pending = line != null && "PENDING".equals(FamilyItems.str(line, "notificationStatus"));
            return pending ? LineClaim.IN_PROGRESS : LineClaim.DONE;
        }
    }

    /** Gives a claim back when its email wasn't accepted, so the event's retry sends it; a line already stamped stays. */
    public void releaseLine(String coachId, String sk) {
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key("COACH#" + coachId, sk))
                    .conditionExpression("notificationStatus = :p").updateExpression("REMOVE notificationStatus, claimedAt")
                    .expressionAttributeValues(Map.of(":p", FamilyItems.s("PENDING"))).build());
        } catch (ConditionalCheckFailedException e) {
            // not ours to give back
        }
    }

    /** Stamps the notification state on lines (ADR-MASTER section 13, "Notification state"). */
    public void markLines(String coachId, List<String> lineSks, String status, String failureReason, Instant at) {
        for (String sk : lineSks) {
            Map<String, AttributeValue> v = new HashMap<>();
            v.put(":s", FamilyItems.s(status));
            v.put(":at", FamilyItems.s(at.toString()));
            v.put(":ch", AttributeValue.fromL(List.of(FamilyItems.s("EMAIL"))));
            String set = "SET notificationStatus = :s, notifiedAt = :at, channels = :ch";
            if (failureReason != null) {
                v.put(":r", FamilyItems.s(failureReason));
                set += ", failureReason = :r";
            }
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key("COACH#" + coachId, sk))
                    .conditionExpression("attribute_exists(SK)")
                    .updateExpression(set + (failureReason == null ? " REMOVE claimedAt, failureReason" : " REMOVE claimedAt"))
                    .expressionAttributeValues(v).build());
        }
    }

    // ---------------------------------------------------------------------- guards

    /**
     * Every email's guard is claimed {@code PENDING@<scope>@<claimed at>} and takes its sent value only once SES has taken
     * the email (2026-11-23; {@code docs/tla/EmailGuard.tla}). A run that finds a fresh {@code PENDING} claim fails, so it
     * is retried; one older than the claiming function's timeout belongs to a run that stopped mid-send and is taken
     * again. So a stopped run never loses an email; one that stopped after SES took it can mean a second copy.
     */
    public static final String PENDING = "PENDING@";

    /** For the consumers' guards: they time out after a minute (infra/lib/consumers.ts). */
    public static final Duration CONSUMER_CLAIM_ABANDONED = Duration.ofMinutes(2);

    /** For the reminder jobs' guards: they time out after 5 minutes (infra/lib/jobs.ts). */
    public static final Duration JOB_CLAIM_ABANDONED = Duration.ofMinutes(6);

    /** What a guard's claim found. */
    public enum GuardClaim {
        /** This run holds it: send, then {@link #confirm} or {@link #release}. */
        CLAIMED,
        /** Another run claimed it moments ago and may still be sending: fail, so the run is retried. */
        IN_PROGRESS,
        /** Sent or refused already, or the item is gone: nothing to do. */
        DONE
    }

    /**
     * One email's guard on one item. {@code path}: the attribute, or a map's attribute ({@code pendingLeave.emailSent}).
     * {@code scope}: empty for a once-only guard; the date (or {@code true}) for a dated one, which the next date claims
     * again. {@code sent}: its value once the email has gone. {@code pending}: this claim's value. {@code also}: a further
     * condition on the item, with its values.
     */
    public record Guard(String pk, String sk, List<String> path, String scope, AttributeValue sent, String pending, String also,
                        Map<String, AttributeValue> alsoValues) {

        String prefix() {
            return PENDING + scope + "@";
        }

        String name() {
            List<String> n = new ArrayList<>();
            for (int i = 0; i < path.size(); i++) {
                n.add("#a" + i);
            }
            return String.join(".", n);
        }

        Map<String, String> names() {
            Map<String, String> m = new HashMap<>();
            for (int i = 0; i < path.size(); i++) {
                m.put("#a" + i, path.get(i));
            }
            return m;
        }
    }

    /** A once-only guard ({@code confirmationSent}, {@code paymentReminderSent}, {@code inviteEmailSent}, the joined guards). */
    public static Guard once(String pk, String sk, String attr, Instant now) {
        return new Guard(pk, sk, List.of(attr), "", FamilyItems.s(now.toString()), PENDING + "@" + sortable(now), null, Map.of());
    }

    /**
     * A dated guard ({@code remindedOn}, {@code settleReminderSentOn}, {@code morningEmailSentOn}; an ended invitation's
     * {@code emailSent} with {@code true}): its value is {@code value} once sent, and a later value claims it again.
     */
    public static Guard dated(String pk, String sk, String attr, String value, Instant now) {
        return new Guard(pk, sk, List.of(attr), value, FamilyItems.s(value), PENDING + value + "@" + sortable(now), null, Map.of());
    }

    /** The "keep or cancel" email's guard, on the pending leave itself, so a new leave on the same lesson is emailed again. */
    public static Guard leaveEmail(String coachId, LocalDate date, LocalTime start, String leaveId, Instant now) {
        return new Guard("COACH#" + coachId, LessonTime.key(date, start), List.of("pendingLeave", "emailSent"), "",
                AttributeValue.fromBool(true), PENDING + "@" + sortable(now), "#a0.leaveId = :leaveId",
                Map.of(":leaveId", FamilyItems.s(leaveId)));
    }

    /** Claims {@code g}: free, a dated one of another value, or a {@code PENDING} claim older than {@code abandonedAfter}. */
    public GuardClaim claim(Guard g, Instant now, Duration abandonedAfter) {
        Map<String, AttributeValue> v = new HashMap<>(g.alsoValues());
        v.put(":pending", FamilyItems.s(g.pending()));
        v.put(":pfx", FamilyItems.s(g.prefix()));
        v.put(":stale", FamilyItems.s(g.prefix() + sortable(now.minus(abandonedAfter))));
        String n = g.name();
        String free = "attribute_not_exists(" + n + ")";
        if (!g.scope().isEmpty()) {
            v.put(":sent", g.sent());
            free += " OR (" + n + " <> :sent AND NOT begins_with(" + n + ", :pfx))";
        }
        String condition = (g.also() == null ? "attribute_exists(SK)" : g.also())
                + " AND (" + free + " OR (begins_with(" + n + ", :pfx) AND " + n + " <= :stale))";
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(g.pk(), g.sk()))
                    .conditionExpression(condition).updateExpression("SET " + n + " = :pending")
                    .expressionAttributeNames(g.names()).expressionAttributeValues(v).build());
            return GuardClaim.CLAIMED;
        } catch (ConditionalCheckFailedException e) {
            Map<String, AttributeValue> item = db().getItem(GetItemRequest.builder().tableName(table)
                    .key(FamilyItems.key(g.pk(), g.sk())).consistentRead(true).build()).item();
            AttributeValue at = item == null || item.isEmpty() ? null : AttributeValue.fromM(item);
            for (String part : g.path()) {
                at = at == null || at.m() == null ? null : at.m().get(part);
            }
            boolean pending = at != null && at.s() != null && at.s().startsWith(g.prefix());
            return pending ? GuardClaim.IN_PROGRESS : GuardClaim.DONE;
        }
    }

    /** The email has gone (or there was nobody to tell): the claim takes the guard's sent value, if it is still this one. */
    public void confirm(Guard g) {
        Map<String, AttributeValue> v = new HashMap<>(Map.of(":pending", FamilyItems.s(g.pending()), ":sent", g.sent()));
        update(g, "SET " + g.name() + " = :sent", v);
    }

    /** Takes a claim back when the email wasn't accepted, so the retry tries again; someone else's claim is left. */
    public void release(Guard g) {
        update(g, "REMOVE " + g.name(), new HashMap<>(Map.of(":pending", FamilyItems.s(g.pending()))));
    }

    private void update(Guard g, String expression, Map<String, AttributeValue> values) {
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(g.pk(), g.sk()))
                    .conditionExpression(g.name() + " = :pending").updateExpression(expression)
                    .expressionAttributeNames(g.names()).expressionAttributeValues(values).build());
        } catch (ConditionalCheckFailedException e) {
            // no longer this claim: taken over after it was abandoned, or the item is gone
        }
    }

    /** Whether a guard's stored value means the email has gone: set, and not a claim still {@code PENDING}. */
    static boolean sent(AttributeValue v) {
        return v != null && (v.s() == null || !v.s().startsWith(PENDING));
    }

    /** An instant as text that sorts as time does: always three decimals ({@code Instant#toString} drops them at .000). */
    static String sortable(Instant t) {
        return java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC).format(t);
    }

    // --------------------------------------------------------------------- helpers

    private static SeatRow seatRow(Map<String, AttributeValue> m) {
        Map<String, String> guards = new HashMap<>();
        for (String g : SEAT_GUARDS) {
            if (m.containsKey(g) && m.get(g).s() != null) {
                guards.put(g, m.get(g).s());
            }
        }
        String pay = m.containsKey("paymentStatus") ? m.get("paymentStatus").s() : "UNPAID";
        return new SeatRow(SeatItems.seat(m), pay, guards);
    }

    private Optional<Map<String, AttributeValue>> get(String pk, String sk) {
        Map<String, AttributeValue> m = db().getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(FamilyItems.key(pk, sk)).build()).item();
        return m == null || m.isEmpty() ? Optional.empty() : Optional.of(m);
    }

    private List<Map<String, AttributeValue>> queryPrefix(String pk, String prefix) {
        List<Map<String, AttributeValue>> out = new ArrayList<>();
        Map<String, AttributeValue> start = null;
        do {
            QueryResponse r = db().query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :p)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s(pk), ":p", FamilyItems.s(prefix)))
                    .exclusiveStartKey(start).build());
            out.addAll(r.items());
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
        return out;
    }

    private void scan(String filter, Map<String, AttributeValue> values, String index, boolean keysOnly,
                      java.util.function.Consumer<Map<String, AttributeValue>> each) {
        Map<String, AttributeValue> start = null;
        do {
            ScanRequest.Builder b = ScanRequest.builder().tableName(table).exclusiveStartKey(start);
            if (index != null) {
                b.indexName(index);
            }
            if (filter != null) {
                b.filterExpression(filter).expressionAttributeValues(values);
            }
            if (keysOnly) {
                b.projectionExpression("PK, SK").select(Select.SPECIFIC_ATTRIBUTES);
            }
            ScanResponse r = db().scan(b.build());
            r.items().forEach(each);
            start = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (start != null);
    }

    private DynamoDbClient db() {
        return clients.forConsumer();
    }
}
