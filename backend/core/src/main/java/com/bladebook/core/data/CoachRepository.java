package com.bladebook.core.data;

import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.PaymentTypes.Type;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.CancellationReason;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.Delete;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactionCanceledException;
import software.amazon.awssdk.services.dynamodb.model.Update;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The coach profile ({@code COACH#<coachId> / PROFILE}) and the coach code ({@code CODE#<code> / CODE}).
 *
 * <p>Every method takes the caller's {@link AccessContext} and touches only that coach's partition,
 * plus the {@code CODE#} item, which it only writes: {@code coach-tenant} can't read {@code CODE#}
 * and may write only {@code PK}, {@code SK}, {@code coachId}, {@code coachFirstName},
 * {@code coachLastName} and {@code profilePhotoKey} there (ADR-MASTER section 16). Nothing here
 * asks for return values.
 */
public final class CoachRepository {

    /** Another coach already has this code. The caller picks a new one and tries again. */
    public static final class CodeTakenException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        CodeTakenException() {
            super("coach code already in use");
        }
    }

    static final String PROFILE = "PROFILE";
    private static final String NOT_FOUND = "Finish setting up your account first.";
    private static final String CHANGED = "Your profile changed in another window. Reload the page and try again.";

    private final TenantClients clients;
    private final String table;

    public CoachRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    // ------------------------------------------------------------------ reads

    public Optional<CoachProfile> find(AccessContext ctx) {
        Map<String, AttributeValue> item = clients.clientFor(ctx).getItem(GetItemRequest.builder()
                .tableName(table).consistentRead(true).key(profileKey(ctx)).build()).item();
        return item == null || item.isEmpty() ? Optional.empty() : Optional.of(fromItem(item));
    }

    // ----------------------------------------------------------------- writes

    /**
     * Writes a new profile. If its business email is confirmed, the {@code CODE#} item is written in
     * the same transaction; otherwise the code waits (ADR-016, amended 2026-11-06).
     *
     * @throws DomainException CONFLICT if the coach already has a profile
     * @throws CodeTakenException if another coach has the code
     */
    public void create(AccessContext ctx, CoachProfile p) {
        mustBeCaller(ctx, p);
        Put profile = Put.builder().tableName(table).item(toItem(p))
                .conditionExpression("attribute_not_exists(PK)").build();
        if (!p.codeWorks()) {
            try {
                clients.clientFor(ctx).putItem(PutItemRequest.builder().tableName(table).item(profile.item())
                        .conditionExpression(profile.conditionExpression()).build());
            } catch (ConditionalCheckFailedException e) {
                throw DomainException.conflict("Your account is already set up.");
            }
            return;
        }
        transact(ctx, List.of(
                TransactWriteItem.builder().put(profile).build(),
                TransactWriteItem.builder().put(putCode(p.coachCode(), p)).build()),
                DomainException.conflict("Your account is already set up."), 1);
    }

    /** Names, phone and time zone. A rename keeps the {@code CODE#} item's name in step. */
    public void updateDetails(AccessContext ctx, CoachProfile p) {
        mustBeCaller(ctx, p);
        Map<String, AttributeValue> values = new HashMap<>();
        values.put(":f", s(p.firstName()));
        values.put(":l", s(p.lastName()));
        values.put(":tz", s(p.coachTimezone()));
        String expr = "SET firstName = :f, lastName = :l, coachTimezone = :tz";
        if (p.phone() != null) {
            values.put(":ph", s(p.phone()));
            expr += ", phone = :ph";
        } else {
            expr += " REMOVE phone";
        }
        List<TransactWriteItem> writes = new ArrayList<>();
        writes.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(profileKey(ctx))
                .conditionExpression("attribute_exists(PK)")
                .updateExpression(expr).expressionAttributeValues(values).build()).build());
        if (p.codeWorks()) {
            writes.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(codeKey(p.coachCode()))
                    .conditionExpression("coachId = :id")
                    .updateExpression("SET coachFirstName = :f, coachLastName = :l")
                    .expressionAttributeValues(Map.of(":f", s(p.firstName()), ":l", s(p.lastName()),
                            ":id", s(ctx.coachId())))
                    .build()).build());
        }
        transact(ctx, writes, DomainException.notFound(NOT_FOUND), -1);
    }

    /** Replaces the payment instructions and every payment type. */
    /** The two contact switches families see the effect of (ADR-MASTER section 4). */
    public void updateVisibility(AccessContext ctx, boolean showPhone, boolean showEmail) {
        transact(ctx, List.of(TransactWriteItem.builder().update(Update.builder().tableName(table).key(profileKey(ctx))
                .conditionExpression("attribute_exists(PK)")
                .updateExpression("SET displayPhoneToClients = :p, displayEmailToClients = :e")
                .expressionAttributeValues(Map.of(":p", AttributeValue.fromBool(showPhone), ":e", AttributeValue.fromBool(showEmail)))
                .build()).build()), DomainException.notFound(NOT_FOUND), -1);
    }

    public void updatePayments(AccessContext ctx, String instructions, PaymentTypes payments) {
        Map<String, AttributeValue> values = new HashMap<>();
        List<String> set = new ArrayList<>();
        List<String> remove = new ArrayList<>();
        if (instructions != null) {
            values.put(":pi", s(instructions));
            set.add("paymentInstructions = :pi");
        } else {
            remove.add("paymentInstructions");
        }
        int i = 0;
        for (Type t : Type.values()) {
            values.put(":on" + i, AttributeValue.fromBool(payments.isOn(t)));
            set.add(t.switchField() + " = :on" + i);
            if (t.hasHandle()) {
                Optional<String> h = payments.handle(t);
                if (h.isPresent()) {
                    values.put(":h" + i, s(h.get()));
                    set.add(t.handleField() + " = :h" + i);
                } else {
                    remove.add(t.handleField());
                }
            }
            i++;
        }
        String expr = "SET " + String.join(", ", set) + (remove.isEmpty() ? "" : " REMOVE " + String.join(", ", remove));
        transact(ctx, List.of(TransactWriteItem.builder().update(Update.builder().tableName(table).key(profileKey(ctx))
                .conditionExpression("attribute_exists(PK)")
                .updateExpression(expr).expressionAttributeValues(values).build()).build()),
                DomainException.notFound(NOT_FOUND), -1);
    }

    /**
     * Rotates the code. A working code is swapped in one transaction: the new {@code CODE#} item is
     * written, the old one deleted, so the old code stops working at once. A code that isn't working
     * yet only changes on the profile.
     *
     * @param current the profile as the caller last read it; if its code has changed since, CONFLICT
     */
    public void replaceCode(AccessContext ctx, CoachProfile current, CoachCode next) {
        mustBeCaller(ctx, current);
        List<TransactWriteItem> writes = new ArrayList<>();
        writes.add(TransactWriteItem.builder().update(Update.builder().tableName(table).key(profileKey(ctx))
                .conditionExpression("coachCode = :old")
                .updateExpression("SET coachCode = :new")
                .expressionAttributeValues(Map.of(":old", s(current.coachCode().value()), ":new", s(next.value())))
                .build()).build());
        if (current.codeWorks()) {
            writes.add(TransactWriteItem.builder().put(putCode(next, current)).build());
            writes.add(TransactWriteItem.builder().delete(Delete.builder().tableName(table)
                    .key(codeKey(current.coachCode()))
                    .conditionExpression("coachId = :id")
                    .expressionAttributeValues(Map.of(":id", s(ctx.coachId()))).build()).build());
        }
        transact(ctx, writes, DomainException.conflict(CHANGED), 1);
    }

    /**
     * Makes {@code address} the business email and writes the {@code CODE#} item, so the code starts
     * working. Only while no business email is confirmed yet.
     *
     * @param code the code to make work: the profile's own, or a new one after a collision
     */
    public void activateBusinessEmail(AccessContext ctx, CoachProfile current, String address, CoachCode code) {
        mustBeCaller(ctx, current);
        transact(ctx, List.of(
                TransactWriteItem.builder().update(Update.builder().tableName(table).key(profileKey(ctx))
                        .conditionExpression("attribute_exists(PK) AND attribute_not_exists(businessEmail)")
                        .updateExpression("SET businessEmail = :b, coachCode = :c REMOVE pendingBusinessEmail")
                        .expressionAttributeValues(Map.of(":b", s(address), ":c", s(code.value()))).build()).build(),
                TransactWriteItem.builder().put(putCode(code, current)).build()),
                DomainException.conflict("Your business email is already confirmed."), 1);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Runs the writes. A failed condition on the write at {@code codeIndex} means the code is taken;
     * any other failed condition throws {@code otherwise}.
     */
    private void transact(AccessContext ctx, List<TransactWriteItem> writes, DomainException otherwise, int codeIndex) {
        try {
            clients.clientFor(ctx).transactWriteItems(TransactWriteItemsRequest.builder().transactItems(writes).build());
        } catch (TransactionCanceledException e) {
            List<CancellationReason> reasons = e.cancellationReasons();
            for (int i = 0; i < reasons.size(); i++) {
                if (!"ConditionalCheckFailed".equals(reasons.get(i).code())) {
                    continue;
                }
                // the first failed condition decides: the profile's own (index 0) comes first
                throw i == codeIndex ? new CodeTakenException() : otherwise;
            }
            throw e;
        }
    }

    private Put putCode(CoachCode code, CoachProfile p) {
        Map<String, AttributeValue> item = new HashMap<>(codeKey(code));
        item.put("coachId", s(p.coachId()));
        item.put("coachFirstName", s(p.firstName()));
        item.put("coachLastName", s(p.lastName()));
        return Put.builder().tableName(table).item(item).conditionExpression("attribute_not_exists(PK)").build();
    }

    private static void mustBeCaller(AccessContext ctx, CoachProfile p) {
        if (!ctx.coachId().equals(p.coachId())) {
            throw new IllegalArgumentException("profile does not belong to the caller");
        }
    }

    private static Map<String, AttributeValue> profileKey(AccessContext ctx) {
        return Map.of("PK", s(ctx.partitionKey()), "SK", s(PROFILE));
    }

    private static Map<String, AttributeValue> codeKey(CoachCode code) {
        return Map.of("PK", s("CODE#" + code.value()), "SK", s("CODE"));
    }

    private static AttributeValue s(String v) {
        return AttributeValue.fromS(v);
    }

    static Map<String, AttributeValue> toItem(CoachProfile p) {
        Map<String, AttributeValue> m = new HashMap<>();
        m.put("PK", s("COACH#" + p.coachId()));
        m.put("SK", s(PROFILE));
        m.put("firstName", s(p.firstName()));
        m.put("lastName", s(p.lastName()));
        m.put("loginEmail", s(p.loginEmail()));
        putIf(m, "businessEmail", p.businessEmail());
        putIf(m, "pendingBusinessEmail", p.pendingBusinessEmail());
        putIf(m, "phone", p.phone());
        m.put("coachTimezone", s(p.coachTimezone()));
        m.put("currency", s(p.currency().name()));
        m.put("requiredNoticeHours", AttributeValue.fromN(Integer.toString(p.requiredNoticeHours())));
        m.put("coachCode", s(p.coachCode().value()));
        putIf(m, "paymentInstructions", p.paymentInstructions());
        for (Type t : Type.values()) {
            m.put(t.switchField(), AttributeValue.fromBool(p.payments().isOn(t)));
            if (t.hasHandle()) {
                p.payments().handle(t).ifPresent(h -> m.put(t.handleField(), s(h)));
            }
        }
        m.put("displayPhoneToClients", AttributeValue.fromBool(p.displayPhoneToClients()));
        m.put("displayEmailToClients", AttributeValue.fromBool(p.displayEmailToClients()));
        m.put("smsCancellationAlerts", AttributeValue.fromBool(p.smsCancellationAlerts()));
        return m;
    }

    static CoachProfile fromItem(Map<String, AttributeValue> m) {
        Set<Type> on = EnumSet.noneOf(Type.class);
        Map<Type, String> handles = new EnumMap<>(Type.class);
        for (Type t : Type.values()) {
            if (bool(m, t.switchField())) {
                on.add(t);
            }
            if (t.hasHandle() && m.containsKey(t.handleField())) {
                handles.put(t, m.get(t.handleField()).s());
            }
        }
        return CoachProfile.builder()
                .coachId(m.get("PK").s().substring("COACH#".length()))
                .firstName(str(m, "firstName"))
                .lastName(str(m, "lastName"))
                .loginEmail(str(m, "loginEmail"))
                .businessEmail(str(m, "businessEmail"))
                .pendingBusinessEmail(str(m, "pendingBusinessEmail"))
                .phone(str(m, "phone"))
                .coachTimezone(str(m, "coachTimezone"))
                .currency(CoachProfile.Currency.valueOf(str(m, "currency")))
                .requiredNoticeHours(Integer.parseInt(m.get("requiredNoticeHours").n()))
                .coachCode(CoachCode.parse(str(m, "coachCode")))
                .paymentInstructions(str(m, "paymentInstructions"))
                .payments(PaymentTypes.of(on, handles))
                .displayPhoneToClients(bool(m, "displayPhoneToClients"))
                .displayEmailToClients(bool(m, "displayEmailToClients"))
                .smsCancellationAlerts(bool(m, "smsCancellationAlerts"))
                .build();
    }

    private static void putIf(Map<String, AttributeValue> m, String k, String v) {
        if (v != null) {
            m.put(k, s(v));
        }
    }

    private static String str(Map<String, AttributeValue> m, String k) {
        AttributeValue v = m.get(k);
        return v == null ? null : v.s();
    }

    private static boolean bool(Map<String, AttributeValue> m, String k) {
        AttributeValue v = m.get(k);
        return v != null && Boolean.TRUE.equals(v.bool());
    }
}
