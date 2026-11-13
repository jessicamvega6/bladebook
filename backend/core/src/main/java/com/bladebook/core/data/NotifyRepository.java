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
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

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

        public boolean has(String guard) {
            return guards.containsKey(guard);
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
    public static final String JOINED_EMAIL_SENT = "joinedEmailSent";
    /** On the coach's profile. */
    public static final String MORNING_EMAIL_SENT_ON = "morningEmailSentOn";

    private static final List<String> SEAT_GUARDS = List.of(CONFIRMATION_SENT, PAYMENT_REMINDER_SENT, REMINDED_ON,
            SETTLE_REMINDER_SENT_ON, INVITE_EMAIL_SENT, JOINED_EMAIL_SENT);

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

    /** Every coach with a profile. Only the nightly roller uses it; on AWS it's a scan of the profiles too. */
    public List<String> coachIds() {
        List<String> out = new ArrayList<>();
        scan("begins_with(PK, :c) AND SK = :p", Map.of(":c", FamilyItems.s("COACH#"), ":p", FamilyItems.s("PROFILE")), null,
                m -> out.add(m.get("PK").s().substring("COACH#".length())));
        return out;
    }

    // -------------------------------------------------------------- lessons and seats

    public Optional<SeatRow> seat(String coachId, String seatKey) {
        return get("COACH#" + coachId, seatKey).map(NotifyRepository::seatRow);
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
                    p.containsKey("emailSent"));
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
                m.containsKey("emailSent"));
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
        scan(null, Map.of(), LocalTable.GSI3, m -> out.add(seatRow(m)));
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
                    .conditionExpression("attribute_exists(SK)").updateExpression(failureReason == null ? set + " REMOVE failureReason" : set)
                    .expressionAttributeValues(v).build());
        }
    }

    // ---------------------------------------------------------------------- guards

    /**
     * Sets {@code attr = value} on an item that exists, unless it already has that value. {@code true} means this caller
     * claimed it and should send; {@code false}, someone already did (or the item is gone).
     */
    public boolean claim(String pk, String sk, String attr, String value) {
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(pk, sk))
                    .conditionExpression("attribute_exists(SK) AND (attribute_not_exists(#g) OR #g <> :v)")
                    .updateExpression("SET #g = :v").expressionAttributeNames(Map.of("#g", attr))
                    .expressionAttributeValues(Map.of(":v", FamilyItems.s(value))).build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    /** Takes a claim back when the email wasn't accepted, so the next run tries again. */
    public void release(String pk, String sk, String attr, String value) {
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key(pk, sk))
                    .conditionExpression("#g = :v").updateExpression("REMOVE #g").expressionAttributeNames(Map.of("#g", attr))
                    .expressionAttributeValues(Map.of(":v", FamilyItems.s(value))).build());
        } catch (ConditionalCheckFailedException e) {
            // someone else's claim now: leave it
        }
    }

    /** The "keep or cancel" email's guard, on the pending leave itself, so a new leave on the same lesson is emailed again. */
    public boolean claimLeaveEmail(String coachId, LocalDate date, LocalTime start, String leaveId, boolean take) {
        try {
            db().updateItem(UpdateItemRequest.builder().tableName(table).key(FamilyItems.key("COACH#" + coachId, LessonTime.key(date, start)))
                    .conditionExpression(take ? "pendingLeave.leaveId = :id AND attribute_not_exists(pendingLeave.emailSent)"
                            : "pendingLeave.leaveId = :id")
                    .updateExpression(take ? "SET pendingLeave.emailSent = :t" : "REMOVE pendingLeave.emailSent")
                    .expressionAttributeValues(take ? Map.of(":id", FamilyItems.s(leaveId), ":t", AttributeValue.fromBool(true))
                            : Map.of(":id", FamilyItems.s(leaveId)))
                    .build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
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

    private void scan(String filter, Map<String, AttributeValue> values, String index, java.util.function.Consumer<Map<String, AttributeValue>> each) {
        Map<String, AttributeValue> start = null;
        do {
            ScanRequest.Builder b = ScanRequest.builder().tableName(table).exclusiveStartKey(start);
            if (index != null) {
                b.indexName(index);
            }
            if (filter != null) {
                b.filterExpression(filter).expressionAttributeValues(values);
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
