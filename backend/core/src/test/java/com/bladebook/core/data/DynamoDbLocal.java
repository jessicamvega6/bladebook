package com.bladebook.core.data;

import org.testcontainers.containers.GenericContainer;

import java.net.URI;
import java.util.UUID;

/**
 * Test helper: one DynamoDB Local container for the whole test run, and a fresh table per test
 * class (ADR-013). The table has the same keys as production.
 */
public final class DynamoDbLocal {

    private static final int PORT = 8000;

    @SuppressWarnings("resource") // stopped by Testcontainers' reaper when the JVM exits
    private static final GenericContainer<?> CONTAINER =
            new GenericContainer<>("amazon/dynamodb-local:3.1.0")
                    .withCommand("-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb")
                    .withExposedPorts(PORT);

    private DynamoDbLocal() {
    }

    public static synchronized URI endpoint() {
        if (!CONTAINER.isRunning()) {
            CONTAINER.start();
        }
        return URI.create("http://localhost:" + CONTAINER.getMappedPort(PORT));
    }

    /** Local clients and a newly made table with a unique name. */
    public static Fixture freshTable() {
        TenantClients clients = TenantClients.local(endpoint());
        String table = "bladebook-test-" + UUID.randomUUID();
        LocalTable.ensure(clients.forSetup(), table);
        return new Fixture(clients, table);
    }

    public static final class Fixture {
        public final TenantClients clients;
        public final String table;

        Fixture(TenantClients clients, String table) {
            this.clients = clients;
            this.table = table;
        }
    }
}
