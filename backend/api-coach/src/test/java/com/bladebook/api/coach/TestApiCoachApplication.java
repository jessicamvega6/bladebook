package com.bladebook.api.coach;

import org.springframework.boot.SpringApplication;

/**
 * Starts the API from the test classpath, so test-only beans such as {@code TestTokenStub} are there. The seed generator
 * runs it with the {@code local,stub-tokens} profiles: {@code ./mvnw -pl api-coach spring-boot:test-run} (ruling I32).
 */
public class TestApiCoachApplication {

    public static void main(String[] args) {
        SpringApplication.from(ApiCoachApplication::main).run(args);
    }
}
