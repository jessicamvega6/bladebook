package com.bladebook.core.data;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.SdkHttpClient;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.sts.StsClient;
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider;
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest;
import software.amazon.awssdk.services.sts.model.Tag;

import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

/**
 * The only place a request-path DynamoDB client is made (ADR-MASTER section 16, {@code clientFor}).
 *
 * <p><b>On AWS</b> ({@link #aws}) the API functions' own roles hold no DynamoDB actions. Each client here is a session of a
 * tenant role, assumed with the caller's tags: {@code coach-tenant} tagged {@code coachId}; {@code client-tenant} tagged
 * {@code clientId}, and for a request about one coach also {@code coachId} and {@code linkStatus}; {@code code-lookup}
 * untagged, before sign-in. Every session has the person's {@code sub} as its source identity and lasts an hour. Sessions
 * are cached per tags in the container and renewed five minutes before they expire.
 *
 * <p><b>Local mode</b> ({@link #local}) returns one unscoped client and refuses to start unless the endpoint is localhost, so
 * it can never point at a real table.
 */
public final class TenantClients {

    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]", "::1");

    /** Sessions kept per container. A Lambda container serves one request at a time, so this is ample. */
    static final int MAX_SESSIONS = 256;
    static final Duration SESSION = Duration.ofHours(1);
    static final Duration RENEW_BEFORE = Duration.ofMinutes(5);

    /** The tenant roles' ARNs, from the function's environment. A function that doesn't use a role leaves it null. */
    public record Roles(String coachTenant, String clientTenant, String codeLookup) {
    }

    private final LocalStream local;
    private final Sessions sessions;

    private TenantClients(LocalStream local, Sessions sessions) {
        this.local = local;
        this.sessions = sessions;
    }

    /** DynamoDB Local. Throws unless {@code endpoint} is localhost. */
    public static TenantClients local(URI endpoint) {
        if (endpoint == null || endpoint.getHost() == null || !LOCAL_HOSTS.contains(endpoint.getHost())) {
            throw new IllegalStateException("Local mode needs a localhost DynamoDB endpoint.");
        }
        DynamoDbClient client = DynamoDbClient.builder()
                .endpointOverride(endpoint)
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("local", "local")))
                .httpClient(UrlConnectionHttpClient.create())
                .build();
        return new TenantClients(new LocalStream(client), null);
    }

    /** On AWS: the region and the function's own credentials come from the Lambda environment. */
    public static TenantClients aws(Roles roles) {
        SdkHttpClient http = UrlConnectionHttpClient.create();
        Region region = new DefaultAwsRegionProviderChain().getRegion();
        return new TenantClients(null, new Sessions(roles, StsClient.builder().region(region).httpClient(http).build(), http, region));
    }

    /** The AWS-mode sessions; null in local mode. For tests. */
    Sessions sessions() {
        return sessions;
    }

    /** For tests: AWS mode with a given STS client. */
    static TenantClients aws(Roles roles, StsClient sts) {
        return new TenantClients(null, new Sessions(roles, sts, UrlConnectionHttpClient.create(), Region.US_EAST_1));
    }

    /** The local stand-in for the table's stream (SC-20): off until the API switches it on. Local mode only. */
    public LocalStream localStream() {
        if (local == null) {
            throw new IllegalStateException("The local stream exists only in local mode.");
        }
        return local;
    }

    /** The client for one coach's request: {@code coach-tenant}, tagged {@code coachId}. */
    public DynamoDbClient clientFor(AccessContext ctx) {
        Objects.requireNonNull(ctx, "ctx");
        if (local != null) {
            return local;
        }
        return sessions.get(sessions.roles.coachTenant(), "coach-" + ctx.coachId(), ctx.coachId(),
                List.of(tag("coachId", ctx.coachId())));
    }

    /**
     * The client for a family's request: the first {@code client-tenant} session, tagged only {@code clientId}, which reads
     * the family's own partition and {@code CODE#} (ADR-MASTER section 16).
     */
    public DynamoDbClient clientFor(ClientContext ctx) {
        Objects.requireNonNull(ctx, "ctx");
        if (local != null) {
            return local;
        }
        return sessions.get(sessions.roles.clientTenant(), "client-" + ctx.clientId(), ctx.clientId(),
                List.of(tag("clientId", ctx.clientId())));
    }

    /**
     * The client for a family's request about one coach: the second {@code client-tenant} session, tagged {@code clientId},
     * {@code coachId} and {@code linkStatus}. Takes a {@link LinkedCoach}, which only core.data makes from the family's own
     * links.
     */
    public DynamoDbClient clientFor(ClientContext ctx, LinkedCoach coach) {
        Objects.requireNonNull(ctx, "ctx");
        Objects.requireNonNull(coach, "coach");
        if (local != null) {
            return local;
        }
        return sessions.get(sessions.roles.clientTenant(), "client-" + ctx.clientId(), ctx.clientId(), List.of(
                tag("clientId", ctx.clientId()),
                tag("coachId", coach.coachId()),
                tag("linkStatus", coach.active() ? "ACTIVE" : "PENDING")));
    }

    /** Before sign-in: {@code code-lookup}, untagged, which can only read a {@code CODE#} item's name fields. */
    public DynamoDbClient forCodeLookup() {
        if (local != null) {
            return local;
        }
        return sessions.get(sessions.roles.codeLookup(), "code-lookup", null, List.of());
    }

    /** The event consumers and scheduled jobs: their own execution roles, which IAM limits per function (section 2). */
    public DynamoDbClient forConsumer() {
        if (local != null) {
            return local;
        }
        return sessions.own();
    }

    /** Creating the local table, and test setup. Local mode only; never used on a request path. */
    public DynamoDbClient forSetup() {
        if (local == null) {
            throw new IllegalStateException("Setup runs only against DynamoDB Local; on AWS the table is built by the stack.");
        }
        return local;
    }

    private static Tag tag(String key, String value) {
        return Tag.builder().key(key).value(value).build();
    }

    /** The cached tenant sessions, one DynamoDB client each, sharing one HTTP client. */
    static final class Sessions {

        final Roles roles;
        private final StsClient sts;
        private final SdkHttpClient http;
        private final Region region;
        private final Map<String, Session> cache = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Session> eldest) {
                if (size() > MAX_SESSIONS) {
                    eldest.getValue().close();
                    return true;
                }
                return false;
            }
        };
        private volatile DynamoDbClient own;

        Sessions(Roles roles, StsClient sts, SdkHttpClient http, Region region) {
            this.roles = Objects.requireNonNull(roles, "roles");
            this.sts = sts;
            this.http = http;
            this.region = region;
        }

        synchronized DynamoDbClient get(String roleArn, String sessionName, String sourceIdentity, List<Tag> tags) {
            if (roleArn == null || roleArn.isBlank()) {
                throw new IllegalStateException("This function has no role for " + sessionName.replaceAll("-.*", "") + " requests.");
            }
            String key = roleArn + "|" + tags;
            Session s = cache.get(key);
            if (s == null) {
                AssumeRoleRequest request = request(roleArn, sessionName, sourceIdentity, tags);
                s = new Session(request, provider(request), http, region);
                cache.put(key, s);
            }
            return s.db;
        }

        AssumeRoleRequest request(String roleArn, String sessionName, String sourceIdentity, List<Tag> tags) {
            if (sessionName.length() > 64) {
                throw new IllegalArgumentException("A session name is at most 64 characters.");
            }
            AssumeRoleRequest.Builder b = AssumeRoleRequest.builder()
                    .roleArn(roleArn)
                    .roleSessionName(sessionName)
                    .durationSeconds((int) SESSION.toSeconds());
            if (!tags.isEmpty()) {
                b.tags(tags);
            }
            if (sourceIdentity != null) {
                b.sourceIdentity(sourceIdentity);
            }
            return b.build();
        }

        private StsAssumeRoleCredentialsProvider provider(AssumeRoleRequest request) {
            Supplier<AssumeRoleRequest> same = () -> request;
            return StsAssumeRoleCredentialsProvider.builder()
                    .stsClient(sts)
                    .refreshRequest(same)
                    .staleTime(RENEW_BEFORE)
                    // No background refresh: a Lambda container is frozen between requests.
                    .asyncCredentialUpdateEnabled(false)
                    .build();
        }

        DynamoDbClient own() {
            DynamoDbClient c = own;
            if (c == null) {
                synchronized (this) {
                    if (own == null) {
                        own = DynamoDbClient.builder().region(region).httpClient(http).build();
                    }
                    c = own;
                }
            }
            return c;
        }

        /** The cached sessions' requests, least recently used first. For tests. */
        synchronized List<AssumeRoleRequest> requests() {
            return cache.values().stream().map(x -> x.request).toList();
        }

        /** Resolves the credentials of the session {@code db} belongs to, which calls STS. For tests. */
        synchronized void resolve(DynamoDbClient db) {
            cache.values().stream().filter(x -> x.db == db).findFirst().orElseThrow().credentials.resolveCredentials();
        }
    }

    private static final class Session {
        final AssumeRoleRequest request;
        final StsAssumeRoleCredentialsProvider credentials;
        final DynamoDbClient db;

        Session(AssumeRoleRequest request, StsAssumeRoleCredentialsProvider credentials, SdkHttpClient http, Region region) {
            this.request = request;
            this.credentials = credentials;
            // The shared HTTP client isn't closed with this client: the SDK leaves a client it was given open.
            this.db = DynamoDbClient.builder().region(region).httpClient(http).credentialsProvider(credentials).build();
        }

        void close() {
            db.close();
            credentials.close();
        }
    }
}
