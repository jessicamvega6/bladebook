package com.bladebook.api.coach;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * api-coach: serves the coach website and its rinkside page. Locally a plain main() on :8080; on AWS,
 * {@link StreamLambdaHandler} runs the same application inside Lambda.
 */
@SpringBootApplication
public class ApiCoachApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApiCoachApplication.class, args);
    }
}
