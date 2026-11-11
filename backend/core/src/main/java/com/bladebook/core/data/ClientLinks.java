package com.bladebook.core.data;

import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.StudentStatus;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * The write link check (ADR-MASTER section 16): turns a coach and skater ID from a request into a
 * {@link LinkedSkater}, by reading the family's own link item, {@code CLIENT#<sub> / STUDENT#<coachId>#<studentId>}.
 *
 * <table>
 *   <caption>Failures</caption>
 *   <tr><th>Why</th><th>Answer</th><th>Logged</th></tr>
 *   <tr><td>Linked, but not {@code ACTIVE} now</td><td>CONFLICT: "Mia's lessons are no longer available to book.
 *       Contact Coach Dana."</td><td>No</td></tr>
 *   <tr><td>Never this family's</td><td>NO_SUCH_ITEM (a plain 404)</td><td>A security event: family ID, the IDs asked
 *       for, the operation and the time; never values</td></tr>
 * </table>
 */
public final class ClientLinks {

    static final String NOT_FOUND = "That skater couldn’t be found. Reload the page.";

    /** The access-log stream on AWS. Locally it goes to the application log. */
    private static final System.Logger SECURITY = System.getLogger("bladebook.security");
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9-]{1,128}$");

    private final TenantClients clients;
    private final String table;

    public ClientLinks(TenantClients clients, String table) {
        this.clients = clients;
        this.table = table;
    }

    /**
     * @param operation what the request was doing, for the security log ({@code "book"}, {@code "availability"})
     * @throws DomainException NO_SUCH_ITEM if the family has no such link; CONFLICT if it isn't {@code ACTIVE}
     */
    public LinkedSkater requireActive(ClientContext ctx, String coachId, String studentId, String operation) {
        if (!safe(coachId) || !safe(studentId)) {
            neverLinked(ctx, coachId, studentId, operation);
        }
        Map<String, AttributeValue> m = clients.clientFor(ctx).getItem(GetItemRequest.builder().tableName(table)
                .consistentRead(true).key(FamilyItems.linkKey(ctx.clientId(), coachId, studentId)).build()).item();
        if (m == null || m.isEmpty()) {
            neverLinked(ctx, coachId, studentId, operation);
        }
        SkaterLink link = FamilyItems.link(m);
        if (link.status() != StudentStatus.ACTIVE) {
            throw DomainException.conflict(first(link.studentName()) + "’s lessons are no longer available to book. Contact Coach "
                    + link.coachFirstName() + ".");
        }
        return new LinkedSkater(ctx.clientId(), coachId, studentId, link.studentName(), link.coachFirstName());
    }

    /** As {@link #requireActive(ClientContext, String, String, String)}, for a booking. */
    public LinkedSkater requireActive(ClientContext ctx, String coachId, String studentId) {
        return requireActive(ctx, coachId, studentId, "book");
    }

    private static void neverLinked(ClientContext ctx, String coachId, String studentId, String operation) {
        // IDs only, and only ones safe to print: an unsafe one is logged as its length.
        SECURITY.log(System.Logger.Level.WARNING, "never-linked family={0} coachId={1} studentId={2} operation={3}",
                ctx.clientId(), printable(coachId), printable(studentId), operation);
        throw DomainException.noSuchItem(NOT_FOUND);
    }

    private static boolean safe(String id) {
        return id != null && SAFE_ID.matcher(id).matches();
    }

    private static String printable(String id) {
        return safe(id) ? id : id == null ? "(none)" : "(unsafe, " + id.length() + " chars)";
    }

    private static String first(String name) {
        return name.trim().split("\\s+")[0];
    }
}
