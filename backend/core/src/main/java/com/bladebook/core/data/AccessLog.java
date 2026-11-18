package com.bladebook.core.data;

import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * The personal-data access log (ADR-MASTER section 18; ADR-012). Every core method that returns someone else's personal
 * data records a line here before it returns: who asked (the coach or family, and its role), the operation, the IDs of the
 * records returned, and the <b>names</b> of the personal-data fields returned, never their values. The API adds the time,
 * the request ID and the visitor's address.
 *
 * <p>Lines are held for the request and written together, once, before the response is sent ({@link #flush}); if that
 * write fails the request fails (I12, 2026-11-17). On AWS the {@link Sink} writes straight to the access-log group with
 * {@code PutLogEvents}; locally it writes to the application log ({@code bladebook.pii-access}, a listed shortcut, SC-15).
 *
 * <p>Not logged (owner, 2026-11-17, I21): a person reading their own details, and the coach-code lookup before sign-in.
 *
 * <p>Like a logger, it is reached statically: one per function, set up at start ({@link #install}).
 */
public final class AccessLog {

    /** Where lines go. Throws if they weren't stored. */
    @FunctionalInterface
    public interface Sink {
        void write(List<Line> lines);
    }

    /**
     * One line. {@code relationship} is the family's {@code clientRelationship}, when the request read it; else null.
     * {@code counts}: a scheduled job's run, which names how many records of each kind it read instead of their IDs; else
     * null.
     */
    public record Line(Instant at, String requestId, String source, String role, String actor, String relationship,
                       String operation, Map<String, Set<String>> ids, Map<String, Integer> counts, Set<String> fields) {

        /** The line as written: one JSON object, keys in a fixed order, nulls left out. */
        public String json() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("time", at.toString());
            put(m, "requestId", requestId);
            put(m, "source", source);
            m.put("role", role);
            m.put("actor", actor);
            put(m, "relationship", relationship);
            m.put("operation", operation);
            m.put("ids", ids);
            put(m, "counts", counts);
            m.put("fields", fields);
            return JSON.writeValueAsString(m);
        }

        private static void put(Map<String, Object> m, String k, Object v) {
            if (v != null) {
                m.put(k, v);
            }
        }
    }

    /** The IDs of what a read returned, by kind ({@code studentId}, {@code clientId}, ...). */
    public static final class Ids {
        private final Map<String, Set<String>> byKind = new TreeMap<>();

        public Ids add(String kind, String id) {
            if (id != null) {
                byKind.computeIfAbsent(kind, k -> new TreeSet<>()).add(id);
            }
            return this;
        }

        public Ids addAll(String kind, Collection<String> ids) {
            ids.forEach(id -> add(kind, id));
            return this;
        }

        boolean isEmpty() {
            return byKind.isEmpty();
        }

        Map<String, Set<String>> copy() {
            Map<String, Set<String>> m = new TreeMap<>();
            byKind.forEach((k, v) -> m.put(k, Collections.unmodifiableSortedSet(new TreeSet<>(v))));
            return Collections.unmodifiableMap(m);
        }
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final System.Logger LOCAL = System.getLogger("bladebook.pii-access");

    /** Locally: each line to the application log (SC-15). */
    public static final Sink APPLICATION_LOG = lines -> lines.forEach(l -> LOCAL.log(System.Logger.Level.INFO, l.json()));

    private static volatile Sink sink = APPLICATION_LOG;
    private static volatile Clock clock = Clock.systemUTC();
    private static final ThreadLocal<Pending> CURRENT = new ThreadLocal<>();

    private AccessLog() {
    }

    /** Set once at start: CloudWatch on AWS. */
    public static void install(Sink s, Clock c) {
        sink = Objects.requireNonNull(s, "sink");
        clock = Objects.requireNonNull(c, "clock");
    }

    // ------------------------------------------------------------------------------------------------- the request

    /** The API's filter: a request starts. {@code source} is the visitor's address, from CloudFront. */
    public static void begin(String requestId, String source) {
        CURRENT.set(new Pending(requestId, source));
    }

    /**
     * Writes the request's lines, once, before the response. Throws if the write fails, so the request fails and nothing
     * it read is sent. The lines are taken first, so a failed write isn't tried again by the error response.
     */
    public static void flush() {
        Pending p = CURRENT.get();
        if (p == null || p.lines.isEmpty()) {
            return;
        }
        List<Line> lines = List.copyOf(p.lines);
        p.lines.clear();
        sink.write(lines);
    }

    /** The API's filter: the request has ended. Lines not yet written (a response with no body) are written now. */
    public static void end() {
        try {
            flush();
        } finally {
            CURRENT.remove();
        }
    }

    // ------------------------------------------------------------------------------------------------- the lines

    /** A coach's read of families' and skaters' data. */
    public static void coachRead(AccessContext ctx, String operation, Ids ids, Collection<String> fields) {
        Objects.requireNonNull(ctx, "ctx");
        record("coach", ctx.coachId(), null, operation, ids, fields);
    }

    /** A family's read of a coach's or another family's data. {@code relationship}: null unless the request read it. */
    public static void familyRead(ClientContext ctx, String relationship, String operation, Ids ids,
                                  Collection<String> fields) {
        Objects.requireNonNull(ctx, "ctx");
        record("family", ctx.clientId(), relationship, operation, ids, fields);
    }

    /**
     * An event consumer's one line per event (ADR-MASTER section 18; I21): the function is the actor, the event the
     * operation, and the fields named once.
     */
    public static void consumerRun(String function, String event, Ids ids, Collection<String> fields) {
        Objects.requireNonNull(function, "function");
        record("consumer", function, null, event, ids, fields);
    }

    /**
     * A scheduled job's one line per run (ADR-MASTER section 18; I21): the function, the job and the date it ran for, how
     * many records of each kind it read, and the fields named once. Written at once: a job runs outside a request.
     */
    public static void jobRun(String function, String job, java.time.LocalDate date, Map<String, Integer> counts,
                              Collection<String> fields) {
        Objects.requireNonNull(function, "function");
        Objects.requireNonNull(date, "date");
        if (fields.isEmpty()) {
            return;
        }
        Line line = new Line(clock.instant(), null, null, "job", function, null, job + ":" + date, Map.of(),
                Collections.unmodifiableMap(new TreeMap<>(counts)), Collections.unmodifiableSortedSet(new TreeSet<>(fields)));
        Pending p = CURRENT.get();
        if (p == null) {
            sink.write(List.of(line));
        } else {
            p.lines.add(line);
        }
    }

    /** A security event (ADR-MASTER section 18), such as a family asking about a skater it was never linked to. */
    public static void security(String role, String actor, String operation, Ids ids) {
        record(role, actor, null, "security:" + operation, ids, List.of());
    }

    private static void record(String role, String actor, String relationship, String operation, Ids ids,
                               Collection<String> fields) {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(ids, "ids");
        if (fields.isEmpty() && !operation.startsWith("security:")) {
            return; // nothing personal returned
        }
        Pending p = CURRENT.get();
        Line line = new Line(clock.instant(), p == null ? null : p.requestId, p == null ? null : p.source, role, actor,
                relationship, operation, ids.copy(), null, Collections.unmodifiableSortedSet(new TreeSet<>(fields)));
        if (p == null) {
            sink.write(List.of(line)); // outside a request (tests, local jobs): at once
        } else {
            p.lines.add(line);
        }
    }

    private static final class Pending {
        final String requestId;
        final String source;
        final List<Line> lines = new ArrayList<>();

        Pending(String requestId, String source) {
            this.requestId = requestId;
            this.source = source;
        }
    }
}
