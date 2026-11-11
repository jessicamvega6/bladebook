package com.bladebook.core.data;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

import java.net.URI;
import java.util.Objects;
import java.util.Set;

/**
 * The only place a coach-path DynamoDB client is made (ADR-MASTER section 16, {@code clientFor}).
 *
 * <p>On AWS this will assume {@code coach-tenant} per request with the coach's session tag. That
 * mode isn't built yet: nothing is deployed (implementation plan, section 3). <b>Local mode</b>
 * returns one unscoped client and refuses to start unless the endpoint is localhost, so it can
 * never point at a real table.
 */
public final class TenantClients {

    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]", "::1");

    private final DynamoDbClient local;

    private TenantClients(DynamoDbClient local) {
        this.local = local;
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
        return new TenantClients(client);
    }

    /** The client for one coach's request. */
    public DynamoDbClient clientFor(AccessContext ctx) {
        Objects.requireNonNull(ctx, "ctx");
        return local;
    }

    /**
     * The client for a family's request: on AWS, the first {@code client-tenant} session, tagged only
     * {@code clientId}, which reads the family's own partition and {@code CODE#} (ADR-MASTER section 16).
     */
    public DynamoDbClient clientFor(ClientContext ctx) {
        Objects.requireNonNull(ctx, "ctx");
        return local;
    }

    /**
     * The client for a family's request about one coach: on AWS, the second {@code client-tenant} session,
     * tagged {@code clientId}, {@code coachId} and {@code linkStatus}. Takes a {@link LinkedCoach}, which only
     * core.data makes from the family's own links.
     */
    public DynamoDbClient clientFor(ClientContext ctx, LinkedCoach coach) {
        Objects.requireNonNull(ctx, "ctx");
        Objects.requireNonNull(coach, "coach");
        return local;
    }

    /** Before sign-in: on AWS, {@code code-lookup}, which can only read a {@code CODE#} item's name fields. */
    public DynamoDbClient forCodeLookup() {
        return local;
    }

    /** The event consumers' own roles (consumer-student-link, consumer-family-sync). */
    public DynamoDbClient forConsumer() {
        return local;
    }

    /** Creating the local table, and test setup. Never used on a request path. */
    public DynamoDbClient forSetup() {
        return local;
    }
}
