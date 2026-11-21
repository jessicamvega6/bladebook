package com.bladebook.api.client;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.GenericContainer;

/** One DynamoDB Local container for api-client's tests (ADR-013). */
public final class LocalDynamo {

    private static final int PORT = 8000;

    @SuppressWarnings("resource") // stopped by Testcontainers' reaper when the JVM exits
    private static final GenericContainer<?> CONTAINER =
            new GenericContainer<>("amazon/dynamodb-local:3.1.0")
                    .withCommand("-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb")
                    .withExposedPorts(PORT);

    private LocalDynamo() {
    }

    /** Points the local profile at the container. */
    public static synchronized void register(DynamicPropertyRegistry registry) {
        if (!CONTAINER.isRunning()) {
            CONTAINER.start();
        }
        registry.add("bladebook.dynamodb.endpoint", () -> "http://localhost:" + CONTAINER.getMappedPort(PORT));
    }
}
