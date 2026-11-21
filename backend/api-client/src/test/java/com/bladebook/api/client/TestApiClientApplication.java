package com.bladebook.api.client;

import org.springframework.boot.SpringApplication;

/**
 * Starts the API from the test classpath, so test-only beans such as {@code TestTokenStub} are there. The seed generator
 * runs it with the {@code local,stub-tokens} profiles: {@code ./mvnw -pl api-client spring-boot:test-run} (ruling I32).
 */
public class TestApiClientApplication {

    public static void main(String[] args) {
        SpringApplication.from(ApiClientApplication::main).run(args);
    }
}
