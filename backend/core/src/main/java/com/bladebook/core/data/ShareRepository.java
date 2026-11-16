package com.bladebook.core.data;

import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.ShareCode;
import com.bladebook.core.domain.StudentStatus;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.Delete;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;
import software.amazon.awssdk.services.dynamodb.model.Update;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Shared lessons (ADR-MASTER section 8; ADR-026, ADR-031, ADR-033), apart from booking with a second skater
 * ({@link BookingRepository#book}) and a family's cancel of its own seat ({@link CancellationRepository}).
 *
 * <p>The family path takes a {@link LinkedSkater} for every write into a coach's partition and touches only its own seats,
 * by key, each write conditional on the seat being theirs: the invited family's on {@code invitedClientId}, the inviting
 * family's on {@code invitedByClientId}, the staying family's on the lesson's pending leave naming their skater. A family
 * never reads another family's seat.
 *
 * <p>The {@code consumer-invite} copies ({@link #syncLesson}) and the hourly sweep ({@link #due}, {@link #expire},
 * {@link #cancelNoAnswer}) run as their own roles: on AWS, from the stream and the scheduler; locally, called in-process
 * (a listed shortcut).
 */
public final class ShareRepository {

    /** A share code, {@code SKATERCODE#<code> / CODE}: the skater's ID and display name (ADR-MASTER section 3). */
    static final String SKATERCODE = "SKATERCODE#";
    static final String SEATEND = "SEATEND#";

    /** A share code's answer: who it is. The ID never leaves {@code api-client}. */
    public record CodeMatch(String studentId, String displayName) {
    }

    /** How an invitation ended, on its {@code SEATEND#} record. */
    public enum Ended { DECLINED, WITHDRAWN, EXPIRED }

    /** A lesson time's pending leave (ADR-MASTER section 8, "Leaving"): who left in time, who stays, and by when they answer. */
    public record PendingLeave(String leaveId, String leftStudentId, String leftStudentName, Instant leftAt, String stayingStudentId,
                               Instant answerBy) {
    }

    /** One deadline on GSI4: {@code EXPIRE} on an invited seat, {@code ANSWER} on a lesson time. */
    public record Due(String coachId, String itemKey, String kind, Instant dueAt) {
    }

    private final TenantClients clients;
    private final String table;

    public ShareRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // ------------------------------------------------------------------ the share code

    /** The skater a share code belongs to, as typed (any case, dash or not), or empty when there's none. */
    public Optional<CodeMatch> shareCode(String typed) {
        Optional<String> code = ShareCode.normalise(typed);
        if (code.isEmpty()) {
            return Optional.empty();
        }
        Map<String, AttributeValue> m = clients.forCodeLookup().getItem(GetItemRequest.builder().tableName(table)
                .key(FamilyItems.key(SKATERCODE + code.get(), "CODE"))
                .projectionExpression("studentId, studentName").build()).item();
        if (m == null || m.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new CodeMatch(FamilyItems.str(m, "studentId"), FamilyItems.str(m, "studentName")));
    }

    /**
     * The share-check's roster read (ADR-033 d2a): that coach's {@code STUDENT#<studentId>}, projecting only
     * {@code studentStatus}. Empty when the coach has never had the skater.
     */
    public Optional<StudentStatus> rosterStatus(ClientContext ctx, LinkedCoach coach, String studentId) {
        if (!coach.active()) {
            return Optional.empty();
        }
        Map<String, AttributeValue> m = clients.clientFor(ctx, coach).getItem(GetItemRequest.builder().tableName(table)
                .consistentRead(true).key(FamilyItems.studentKey(coach.coachId(), studentId))
                .projectionExpression("studentStatus").build()).item();
        return m == null || m.isEmpty() ? Optional.empty() : Optional.of(StudentStatus.parse(FamilyItems.str(m, "studentStatus")));
    }

    // -------------------------------------------------------------- the invited family

    /**
     * Go ahead, one date (ADR-MASTER section 8, "The invited family"): the invited seat, still {@code INVITED}, with no
     * family, copied to this one and not started, becomes theirs and {@code BOOKED}; the skater joins the lesson's price.
     */
    public boolean accept(ClientContext ctx, LinkedSkater invited, Seat seat, Instant now) {
        Map<String, AttributeValue> v = new HashMap<>();
        v.put(":invited", FamilyItems.s(Seat.Status.INVITED.name()));
        v.put(":booked", FamilyItems.s(Seat.Status.BOOKED.name()));
        v.put(":me", FamilyItems.s(invited.clientId()));
        v.put(":now", FamilyItems.s(seconds(now)));
        v.put(":at", FamilyItems.s(now.toString()));
        v.put(":g1", FamilyItems.s("CLIENT#" + invited.clientId()));
        v.put(":g1s", FamilyItems.s(SeatItems.SEAT + seat.lessonDate() + "#" + seat.startTime()));
        SeatItems.dateIndex(seat.coachId(), seat.lessonDate(), seat.startTime()).forEach((k, val) -> v.put(":" + k, val));
        SeatItems.unpaidIndex(seat.coachId(), seat.lessonDate(), invited.studentId()).forEach((k, val) -> v.put(":" + k, val));
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(seatKey(seat.coachId(), seat.key()))
                .conditionExpression("seatStatus = :invited AND attribute_not_exists(clientId) AND invitedClientId = :me AND startsAtUtc > :now")
                .updateExpression("SET clientId = :me, seatStatus = :booked, joinedAt = :at, GSI1PK = :g1, GSI1SK = :g1s,"
                        + " GSI2PK = :GSI2PK, GSI2SK = :GSI2SK, GSI3PK = :GSI3PK, GSI3SK = :GSI3SK"
                        + " REMOVE GSI4PK, GSI4SK, dueKind, dueAt")
                .expressionAttributeValues(v).build()).build());
        Map<String, AttributeValue> lv = new HashMap<>();
        lv.put(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()));
        lv.put(":one", AttributeValue.fromN("1"));
        lv.put(":me", AttributeValue.fromL(List.of(FamilyItems.s(invited.studentId()))));
        lv.put(":none", AttributeValue.fromL(List.of()));
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table)
                .key(seatKey(seat.coachId(), LessonTime.key(seat.lessonDate(), seat.startTime())))
                .conditionExpression("lessonStatus = :booked")
                .updateExpression("SET shareCount = shareCount + :one, joinOrder = list_append(if_not_exists(joinOrder, :none), :me)")
                .expressionAttributeValues(lv).build()).build());
        items.add(BookingRepository.rosterCheck(table, seat.coachId(), invited.studentId()));
        return write(clients.clientFor(ctx, invited.coach()), items);
    }

    /** Decline, one date: the invited seat moves to {@code SEATEND#} as {@code DECLINED} and its place is freed. */
    public boolean decline(ClientContext ctx, LinkedSkater invited, Seat seat, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(TransactWriteItem.builder().delete(Delete.builder().tableName(table).key(seatKey(seat.coachId(), seat.key()))
                .conditionExpression("seatStatus = :invited AND attribute_not_exists(clientId) AND invitedClientId = :me")
                .expressionAttributeValues(Map.of(":invited", FamilyItems.s(Seat.Status.INVITED.name()), ":me", FamilyItems.s(invited.clientId())))
                .build()).build());
        items.add(put(ended(seat, Ended.DECLINED, invited.clientId(), invited.clientId(), now)));
        items.add(placeFreed(seat.coachId(), seat.lessonDate(), seat.startTime()));
        return write(clients.clientFor(ctx, invited.coach()), items);
    }

    // ------------------------------------------------------------- the inviting family

    /**
     * Withdraw, one date: allowed only while the invited seat is {@code INVITED} and this family invited it. It moves to
     * {@code SEATEND#} as {@code WITHDRAWN}; the inviting skater's lesson stays booked, private at the full price.
     */
    public boolean withdraw(ClientContext ctx, LinkedSkater host, Seat invitedSeat, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(deleteInvited(host.coachId(), invitedSeat.key(), host.clientId()));
        items.add(put(ended(invitedSeat, Ended.WITHDRAWN, null, host.clientId(), now)));
        items.add(placeFreed(host.coachId(), invitedSeat.lessonDate(), invitedSeat.startTime()));
        return write(clients.clientFor(ctx, host.coach()), items);
    }

    /**
     * The invited seat on the inviting family's lesson, as far as that family knows it: its key (from {@code invitedStudentId})
     * and the display name {@code consumer-invite} copied as {@code partnerName}. The family never reads it.
     */
    public static Seat invitedSeatOf(Seat host) {
        String name = host.share().partnerName() == null ? "" : host.share().partnerName();
        return new Seat(host.coachId(), host.lessonDate(), host.startTime(), host.share().invitedStudentId(), null, name, Seat.Status.INVITED,
                host.startsAtUtc(), host.coachTz(), host.durationMinutes(), host.joinedAt(), host.idempotencyKey(), host.recurrenceId(),
                host.bookedIntervalWeeks(), new Seat.Share(host.share().inviteId(), host.clientId(), null, null, null, null, null, null, false));
    }

    // --------------------------------------------------------------- the staying family

    /**
     * Keep it private at the full price (ADR-MASTER section 8, "Leaving"): the family's own write to the lesson time,
     * conditional on its pending leave naming their skater as staying and not being past its answer-by time. The skater
     * pays the whole price, and the lesson becomes a freed place.
     */
    public boolean keep(ClientContext ctx, LinkedSkater staying, Seat seat, Instant now) {
        Map<String, AttributeValue> lv = new HashMap<>();
        lv.put(":me", FamilyItems.s(staying.studentId()));
        lv.put(":now", FamilyItems.s(seconds(now)));
        lv.put(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()));
        lv.put(":one", AttributeValue.fromN("1"));
        lv.put(":order", AttributeValue.fromL(List.of(FamilyItems.s(staying.studentId()))));
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table)
                .key(seatKey(staying.coachId(), LessonTime.key(seat.lessonDate(), seat.startTime())))
                .conditionExpression("lessonStatus = :booked AND pendingLeave.stayingStudentId = :me AND pendingLeave.answerBy > :now")
                .updateExpression("SET shareCount = :one, joinOrder = :order REMOVE pendingLeave, GSI4PK, GSI4SK, dueKind, dueAt")
                .expressionAttributeValues(lv).build()).build());
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(seatKey(staying.coachId(), seat.key()))
                .conditionExpression("clientId = :c AND seatStatus = :booked")
                .updateExpression("SET freedPlace = :t REMOVE choiceAnswerBy")
                .expressionAttributeValues(Map.of(":c", FamilyItems.s(staying.clientId()), ":booked", FamilyItems.s(Seat.Status.BOOKED.name()),
                        ":t", AttributeValue.fromBool(true))).build()).build());
        return write(clients.clientFor(ctx, staying.coach()), items);
    }

    // ----------------------------------------------------------------- a freed place

    /**
     * Invite a skater to a freed place, that one lesson only (ADR-MASTER section 8, "Freed places"): the same as a
     * booking-time invitation, or a sibling added directly. The lesson must still hold only this family's skater, at the
     * full price, with no pending leave.
     */
    public boolean fillFreedPlace(ClientContext ctx, LinkedSkater host, Seat hostSeat, BookingRepository.Partner partner, Instant now) {
        boolean sibling = partner.sibling() != null;
        List<TransactWriteItem> items = new ArrayList<>();
        Map<String, AttributeValue> lv = new HashMap<>();
        lv.put(":booked", FamilyItems.s(LessonTime.Status.BOOKED.name()));
        lv.put(":one", AttributeValue.fromN("1"));
        lv.put(":two", AttributeValue.fromN("2"));
        lv.put(":now", FamilyItems.s(seconds(now)));
        String set = "SET seatsTaken = :two";
        if (sibling) {
            lv.put(":sib", AttributeValue.fromL(List.of(FamilyItems.s(partner.studentId()))));
            set += ", shareCount = :two, joinOrder = list_append(joinOrder, :sib)";
        }
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table)
                .key(seatKey(host.coachId(), LessonTime.key(hostSeat.lessonDate(), hostSeat.startTime())))
                .conditionExpression("lessonStatus = :booked AND seatsTaken = :one AND shareCount = :one AND maxSkaters >= :two"
                        + " AND startsAtUtc > :now AND attribute_not_exists(pendingLeave)")
                .updateExpression(set).expressionAttributeValues(lv).build()).build());
        Map<String, AttributeValue> sv = new HashMap<>();
        sv.put(":c", FamilyItems.s(host.clientId()));
        sv.put(":t", AttributeValue.fromBool(true));
        Seat second;
        if (sibling) {
            second = new Seat(host.coachId(), hostSeat.lessonDate(), hostSeat.startTime(), partner.studentId(), host.clientId(),
                    com.bladebook.core.domain.DisplayName.of(partner.fullName()), Seat.Status.BOOKED, hostSeat.startsAtUtc(), hostSeat.coachTz(),
                    hostSeat.durationMinutes(), now, hostSeat.idempotencyKey());
            items.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(seatKey(host.coachId(), hostSeat.key()))
                    .conditionExpression("clientId = :c AND freedPlace = :t")
                    .updateExpression("SET freedPlace = :f").expressionAttributeValues(Map.of(":c", sv.get(":c"), ":t", sv.get(":t"),
                            ":f", AttributeValue.fromBool(false))).build()).build());
        } else {
            sv.put(":inv", FamilyItems.s(partner.inviteId()));
            sv.put(":sid", FamilyItems.s(partner.studentId()));
            second = Seat.invited(hostSeat, partner.studentId(), partner.fullName(), partner.inviteId(), partner.invitedByName());
            items.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(seatKey(host.coachId(), hostSeat.key()))
                    .conditionExpression("clientId = :c AND freedPlace = :t")
                    .updateExpression("SET inviteId = :inv, invitedStudentId = :sid").expressionAttributeValues(sv).build()).build());
        }
        items.add(TransactWriteItem.builder().put(Put.builder().tableName(table).item(SeatItems.item(second))
                .conditionExpression("attribute_not_exists(SK)").build()).build());
        items.add(BookingRepository.rosterCheck(table, host.coachId(), partner.studentId()));
        return write(clients.clientFor(ctx, host.coach()), items);
    }

    // ---------------------------------------------------------------- consumer-invite

    /**
     * {@code consumer-invite}'s read-only copies for one lesson (ADR-MASTER section 8, "Read-only copies"), worked out
     * afresh from the lesson's seats, its pending leave and its ended invitations, so running it twice changes nothing:
     * <ul>
     *   <li>an invited seat gets the invited family's {@code invitedClientId} and GSI1 keys, from the coach's
     *       {@code STUDENT#} record of the skater;</li>
     *   <li>each seat gets {@code partnerName} and {@code partnerStatus}: the other skater's display name and status; while a
     *       pending leave waits, the one who left, {@code LEFT}, and {@code choiceAnswerBy} on the staying seat; with no
     *       other seat, how the last invitation ended ({@code DECLINED}, {@code WITHDRAWN} or {@code EXPIRED}).</li>
     * </ul>
     */
    public void syncLesson(String coachId, LocalDate date, LocalTime start) {
        DynamoDbClient db = clients.forConsumer();
        String at = date + "#" + start + "#";
        List<Seat> seats = queryPrefix(db, coachId, SeatItems.SEAT + at).stream().map(SeatItems::seat).toList();
        Optional<PendingLeave> pending = pendingLeave(coachId, date, start);
        List<Map<String, AttributeValue>> endings = new ArrayList<>(queryPrefix(db, coachId, SEATEND + at));
        endings.sort(Comparator.comparing(e -> FamilyItems.str(e, "endedAt")));
        Map<String, AttributeValue> lastEnd = endings.isEmpty() ? null : endings.get(endings.size() - 1);
        for (Seat s : seats) {
            Map<String, AttributeValue> v = new HashMap<>();
            List<String> set = new ArrayList<>();
            List<String> remove = new ArrayList<>();
            if (s.seatStatus() == Seat.Status.INVITED && s.share().invitedClientId() == null) {
                Map<String, AttributeValue> r = db.getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                        .key(FamilyItems.studentKey(coachId, s.studentId())).projectionExpression("clientId").build()).item();
                if (r != null && r.containsKey("clientId")) {
                    v.put(":ic", r.get("clientId"));
                    v.put(":g1", FamilyItems.s("CLIENT#" + r.get("clientId").s()));
                    v.put(":g1s", FamilyItems.s(SeatItems.SEAT + date + "#" + start));
                    set.add("invitedClientId = :ic");
                    set.add("GSI1PK = :g1");
                    set.add("GSI1SK = :g1s");
                }
            }
            Optional<Seat> other = seats.stream().filter(o -> !o.studentId().equals(s.studentId())).findFirst();
            String partnerName = null;
            String partnerStatus = null;
            if (other.isPresent()) {
                partnerName = other.get().studentName();
                partnerStatus = other.get().seatStatus().name();
            } else if (pending.isPresent() && pending.get().stayingStudentId().equals(s.studentId())) {
                partnerName = pending.get().leftStudentName();
                partnerStatus = "LEFT";
            } else if (lastEnd != null) {
                partnerName = FamilyItems.str(lastEnd, "studentName");
                partnerStatus = FamilyItems.str(lastEnd, "seatOutcome");
            }
            if (partnerName != null) {
                v.put(":pn", FamilyItems.s(partnerName));
                v.put(":ps", FamilyItems.s(partnerStatus));
                set.add("partnerName = :pn");
                set.add("partnerStatus = :ps");
            } else {
                remove.add("partnerName");
                remove.add("partnerStatus");
            }
            if (pending.isPresent() && pending.get().stayingStudentId().equals(s.studentId())) {
                v.put(":cab", FamilyItems.s(pending.get().answerBy().toString()));
                set.add("choiceAnswerBy = :cab");
            } else {
                remove.add("choiceAnswerBy");
            }
            String expr = (set.isEmpty() ? "" : "SET " + String.join(", ", set)) + (remove.isEmpty() ? "" : " REMOVE " + String.join(", ", remove));
            try {
                db.updateItem(UpdateItemRequest.builder().tableName(table).key(seatKey(coachId, s.key()))
                        .conditionExpression("attribute_exists(PK)").updateExpression(expr.trim())
                        .expressionAttributeValues(v.isEmpty() ? null : v).build());
            } catch (ConditionalCheckFailedException gone) {
                // the seat ended meanwhile: the next change's run copies again
            }
        }
    }

    /** The lesson time's pending leave, read by the consumer and the sweep (never by a family). */
    public Optional<PendingLeave> pendingLeave(String coachId, LocalDate date, LocalTime start) {
        Map<String, AttributeValue> m = clients.forConsumer().getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(seatKey(coachId, LessonTime.key(date, start))).projectionExpression("pendingLeave").build()).item();
        if (m == null || !m.containsKey("pendingLeave")) {
            return Optional.empty();
        }
        Map<String, AttributeValue> p = m.get("pendingLeave").m();
        return Optional.of(new PendingLeave(FamilyItems.str(p, "leaveId"), FamilyItems.str(p, "leftStudentId"),
                FamilyItems.str(p, "leftStudentName"), Instant.parse(FamilyItems.str(p, "leftAt")), FamilyItems.str(p, "stayingStudentId"),
                Instant.parse(FamilyItems.str(p, "answerBy"))));
    }

    /** A pending leave as the lesson time stores it, with its {@code ANSWER} deadline on GSI4 (written by the leaver's cancel). */
    static Map<String, AttributeValue> pendingLeaveItem(PendingLeave p) {
        Map<String, AttributeValue> m = new HashMap<>();
        m.put("leaveId", FamilyItems.s(p.leaveId()));
        m.put("leftStudentId", FamilyItems.s(p.leftStudentId()));
        m.put("leftStudentName", FamilyItems.s(p.leftStudentName()));
        m.put("leftAt", FamilyItems.s(p.leftAt().toString()));
        m.put("stayingStudentId", FamilyItems.s(p.stayingStudentId()));
        m.put("answerBy", FamilyItems.s(p.answerBy().truncatedTo(ChronoUnit.SECONDS).toString()));
        return m;
    }

    // ------------------------------------------------------------- sched-deadline-sweep

    /** Every deadline due by {@code now}, soonest first, through GSI4 (only the sweep reads it). */
    public List<Due> due(Instant now) {
        List<Due> out = new ArrayList<>();
        Map<String, AttributeValue> startKey = null;
        do {
            QueryResponse r = clients.forConsumer().query(QueryRequest.builder().tableName(table).indexName(LocalTable.GSI4)
                    .keyConditionExpression("GSI4PK = :due AND GSI4SK <= :now")
                    .expressionAttributeValues(Map.of(":due", FamilyItems.s(SeatItems.DUE), ":now", FamilyItems.s(seconds(now) + "#~")))
                    .exclusiveStartKey(startKey).build());
            for (Map<String, AttributeValue> m : r.items()) {
                out.add(new Due(m.get("PK").s().substring("COACH#".length()), m.get("SK").s(), FamilyItems.str(m, "dueKind"),
                        Instant.parse(FamilyItems.str(m, "dueAt"))));
            }
            startKey = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (startKey != null);
        out.sort(Comparator.comparing(Due::dueAt));
        return out;
    }

    /** A seat as stored, read by the sweep to re-check it; empty if it's gone. */
    public Optional<Seat> seatAt(String coachId, String seatKey) {
        Map<String, AttributeValue> m = clients.forConsumer().getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(seatKey(coachId, seatKey)).build()).item();
        return m == null || m.isEmpty() ? Optional.empty() : Optional.of(SeatItems.seat(m));
    }

    /** A lesson time as the coach's side reads it, for the sweep's price share; empty if it's gone. */
    public Optional<LessonTime> lessonAt(String coachId, LocalDate date, LocalTime start) {
        Map<String, AttributeValue> m = clients.forConsumer().getItem(GetItemRequest.builder().tableName(table).consistentRead(true)
                .key(seatKey(coachId, LessonTime.key(date, start))).build()).item();
        return m == null || m.isEmpty() ? Optional.empty() : Optional.of(ScheduleRepository.lessonFrom(m));
    }

    /**
     * {@code EXPIRE}: an invitation still unanswered once its lesson has started moves to {@code SEATEND#} as {@code EXPIRED};
     * the lesson goes ahead private (ADR-MASTER section 8, "Deadlines").
     */
    public boolean expire(Seat invited, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        items.add(TransactWriteItem.builder().delete(Delete.builder().tableName(table).key(seatKey(invited.coachId(), invited.key()))
                .conditionExpression("seatStatus = :invited AND startsAtUtc <= :now")
                .expressionAttributeValues(Map.of(":invited", FamilyItems.s(Seat.Status.INVITED.name()), ":now", FamilyItems.s(seconds(now))))
                .build()).build());
        items.add(put(ended(invited, Ended.EXPIRED, invited.share().invitedClientId(), "SWEEP", now)));
        items.add(placeFreed(invited.coachId(), invited.lessonDate(), invited.startTime()));
        return write(clients.forConsumer(), items);
    }

    /** A deadline whose record no longer needs it (answered, accepted, cancelled meanwhile): its GSI4 keys are removed. */
    public void clearDeadline(String coachId, String itemKey) {
        try {
            clients.forConsumer().updateItem(UpdateItemRequest.builder().tableName(table).key(seatKey(coachId, itemKey))
                    .conditionExpression("attribute_exists(PK)").updateExpression("REMOVE GSI4PK, GSI4SK, dueKind, dueAt").build());
        } catch (ConditionalCheckFailedException gone) {
            // nothing left to clear
        }
    }

    /**
     * {@code ANSWER}: the staying family didn't answer by the answer-by time, so their seat is cancelled with no charge,
     * through a change batch with {@code cancelledBy = NO_ANSWER}, and the time goes back on the coach's calendar
     * (ADR-MASTER section 8, "Leaving"; section 14). Conditional on the same pending leave.
     *
     * @param staying the staying skater's seat, or {@code null} when it's gone: then only the pending leave is cleared
     */
    public boolean cancelNoAnswer(String coachId, PendingLeave pending, Seat staying, ChangeBatch batch, CancellationLine line,
                                  LocalDate date, LocalTime start, Instant now) {
        List<TransactWriteItem> items = new ArrayList<>();
        Map<String, AttributeValue> lv = new HashMap<>();
        lv.put(":id", FamilyItems.s(pending.leaveId()));
        lv.put(":now", FamilyItems.s(seconds(now)));
        String set;
        if (staying != null) {
            items.add(TransactWriteItem.builder().delete(Delete.builder().tableName(table).key(seatKey(coachId, staying.key()))
                    .conditionExpression("seatStatus = :st AND joinedAt = :j")
                    .expressionAttributeValues(Map.of(":st", FamilyItems.s(staying.seatStatus().name()), ":j", FamilyItems.s(staying.joinedAt().toString())))
                    .build()).build());
            items.add(put(CancellationItems.header(coachId, batch)));
            items.add(put(CancellationItems.line(coachId, line)));
            lv.put(":open", FamilyItems.s(LessonTime.Status.OPEN.name()));
            lv.put(":zero", AttributeValue.fromN("0"));
            lv.put(":none", AttributeValue.fromL(List.of()));
            set = "SET lessonStatus = :open, seatsTaken = :zero, shareCount = :zero, joinOrder = :none ";
        } else {
            set = "";
        }
        items.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(seatKey(coachId, LessonTime.key(date, start)))
                .conditionExpression("pendingLeave.leaveId = :id AND pendingLeave.answerBy <= :now")
                .updateExpression(set + "REMOVE pendingLeave, GSI4PK, GSI4SK, dueKind, dueAt").expressionAttributeValues(lv).build()).build());
        return write(clients.forConsumer(), items);
    }

    // ---------------------------------------------------------------------- helpers

    /** Delete an invited seat, still {@code INVITED} and invited by this family. */
    static TransactWriteItem deleteInvited(String table, String coachId, String seatKey, String hostClientId) {
        return TransactWriteItem.builder().delete(Delete.builder().tableName(table).key(FamilyItems.key("COACH#" + coachId, seatKey))
                .conditionExpression("seatStatus = :invited AND invitedByClientId = :host")
                .expressionAttributeValues(Map.of(":invited", FamilyItems.s(Seat.Status.INVITED.name()), ":host", FamilyItems.s(hostClientId)))
                .build()).build();
    }

    private TransactWriteItem deleteInvited(String coachId, String seatKey, String hostClientId) {
        return deleteInvited(table, coachId, seatKey, hostClientId);
    }

    /** One place on a booked lesson freed by an ended invitation: the lesson stays booked for its other skater. */
    private TransactWriteItem placeFreed(String coachId, LocalDate date, LocalTime start) {
        return TransactWriteItem.builder().update(Update.builder().tableName(table).key(seatKey(coachId, LessonTime.key(date, start)))
                .conditionExpression("attribute_exists(PK) AND seatsTaken > :zero")
                .updateExpression("SET seatsTaken = seatsTaken - :one")
                .expressionAttributeValues(Map.of(":one", AttributeValue.fromN("1"), ":zero", AttributeValue.fromN("0"))).build()).build();
    }

    /** An ended invitation, {@code SEATEND#<date>#<startTime>#<studentId>#<isoTs>} (ADR-MASTER section 3). */
    static Map<String, AttributeValue> ended(Seat s, Ended how, String clientId, String endedBy, Instant now) {
        Map<String, AttributeValue> m = new HashMap<>(FamilyItems.key("COACH#" + s.coachId(),
                SEATEND + s.lessonDate() + "#" + s.startTime() + "#" + s.studentId() + "#" + now));
        m.put("seatOutcome", FamilyItems.s(how.name()));
        m.put("endedAt", FamilyItems.s(now.toString()));
        m.put("endedBy", FamilyItems.s(endedBy));
        m.put("studentId", FamilyItems.s(s.studentId()));
        m.put("studentName", FamilyItems.s(s.studentName()));
        // The invited family: given, or as consumer-invite copied it onto the seat (a withdrawal knows only the seat).
        String invitedFamily = clientId != null ? clientId : s.share().invitedClientId();
        if (invitedFamily != null) {
            m.put("clientId", FamilyItems.s(invitedFamily));
        }
        // Batch 13: who invited, for the "declined" email to them (not in the ADR's list).
        if (s.share().invitedByClientId() != null) {
            m.put("invitedByClientId", FamilyItems.s(s.share().invitedByClientId()));
        }
        if (s.share().inviteId() != null) {
            m.put("inviteId", FamilyItems.s(s.share().inviteId()));
        }
        return m;
    }

    private List<Map<String, AttributeValue>> queryPrefix(DynamoDbClient db, String coachId, String prefix) {
        List<Map<String, AttributeValue>> out = new ArrayList<>();
        Map<String, AttributeValue> startKey = null;
        do {
            QueryResponse r = db.query(QueryRequest.builder().tableName(table).consistentRead(true)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :p)")
                    .expressionAttributeValues(Map.of(":pk", FamilyItems.s("COACH#" + coachId), ":p", FamilyItems.s(prefix)))
                    .exclusiveStartKey(startKey).build());
            out.addAll(r.items());
            startKey = r.hasLastEvaluatedKey() && !r.lastEvaluatedKey().isEmpty() ? r.lastEvaluatedKey() : null;
        } while (startKey != null);
        return out;
    }

    private Map<String, AttributeValue> seatKey(String coachId, String sk) {
        return FamilyItems.key("COACH#" + coachId, sk);
    }

    private TransactWriteItem put(Map<String, AttributeValue> item) {
        return TransactWriteItem.builder().put(Put.builder().tableName(table).item(item)
                .conditionExpression("attribute_not_exists(SK)").build()).build();
    }

    private static boolean write(DynamoDbClient db, List<TransactWriteItem> items) {
        try {
            db.transactWriteItems(TransactWriteItemsRequest.builder().transactItems(items).build());
            return true;
        } catch (TransactionCanceledException e) {
            if (!e.hasCancellationReasons() || e.cancellationReasons().stream().noneMatch(r -> "ConditionalCheckFailed".equals(r.code()))) {
                throw e;
            }
            return false;
        }
    }

    private static String seconds(Instant now) {
        return now.truncatedTo(ChronoUnit.SECONDS).toString();
    }
}
