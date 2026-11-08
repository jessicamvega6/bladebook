package com.bladebook.api.client;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** Locally api-client must really listen (the serverless auto-configuration is excluded). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class HealthTest {

    @LocalServerPort
    int port;

    @Test
    void healthAnswersOverHttp() throws Exception {
        HttpResponse<String> r = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/client/health")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(port).isPositive();
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("\"ok\"");
    }
}
