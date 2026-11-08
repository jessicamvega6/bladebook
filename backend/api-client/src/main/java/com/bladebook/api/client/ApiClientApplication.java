package com.bladebook.api.client;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * api-client: serves the family website. Locally a plain main() on :8081; on AWS,
 * {@link StreamLambdaHandler} runs the same application inside Lambda.
 */
@SpringBootApplication
public class ApiClientApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApiClientApplication.class, args);
    }
}
