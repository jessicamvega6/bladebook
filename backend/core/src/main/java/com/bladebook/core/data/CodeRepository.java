package com.bladebook.core.data;

import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.StudentStatus;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;

import java.util.Map;
import java.util.Optional;

/**
 * Reads {@code CODE#<code> / CODE} for families (ADR-MASTER section 16):
 * <ul>
 *   <li>before sign-in, under {@code code-lookup}: the coach's name only, so the browser never learns
 *       the coach's ID;</li>
 *   <li>inside a family's session, under {@code client-tenant}: the coach's ID too, so registration
 *       resolves every code again rather than trusting anything the browser carried.</li>
 * </ul>
 * Both read only the allowlisted attributes.
 */
public final class CodeRepository {

    /**
     * A code resolved inside a family's session: the coach, as a {@link LinkedCoach} only core.data can make, so it can tag
     * the session that writes the family's waiting request into that coach's partition (ADR-022 d2, d8; I30). Its standing
     * is {@code PENDING}: the writes don't depend on it, and nothing is read with it.
     */
    public record Found(LinkedCoach coach, CoachName name) {
        public String coachId() {
            return coach.coachId();
        }
    }

    private final TenantClients clients;
    private final String table;

    public CodeRepository(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /** Before sign-in: the name, or empty for a code no coach holds. */
    public Optional<CoachName> lookup(CoachCode code) {
        return read(clients.forCodeLookup().getItem(get(code, "coachFirstName, coachLastName, profilePhotoKey")).item())
                .map(Found::name);
    }

    /** Inside the family's session. */
    public Optional<Found> resolve(ClientContext ctx, CoachCode code) {
        return read(clients.clientFor(ctx).getItem(get(code, "coachId, coachFirstName, coachLastName, profilePhotoKey")).item());
    }

    private GetItemRequest get(CoachCode code, String projection) {
        return GetItemRequest.builder().tableName(table)
                .key(FamilyItems.key("CODE#" + code.value(), "CODE"))
                .projectionExpression(projection)
                .build();
    }

    private static Optional<Found> read(Map<String, AttributeValue> item) {
        if (item == null || item.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new Found(new LinkedCoach(FamilyItems.str(item, "coachId"), StudentStatus.PENDING),
                new CoachName(FamilyItems.str(item, "coachFirstName"), FamilyItems.str(item, "coachLastName"))));
    }
}
