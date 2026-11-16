package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.LocalDynamo;
import com.bladebook.api.coach.security.LocalTokenStub;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The financial page and its download over HTTP (Batch 12). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class FinancialApiTest {

    @DynamicPropertySource
    static void dynamo(DynamicPropertyRegistry registry) {
        LocalDynamo.register(registry);
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @LocalServerPort
    int port;

    @Autowired
    LocalTokenStub stub;

    record Res(int status, JsonNode body) {
        String s(String field) {
            JsonNode n = body.get(field);
            return n == null || n.isNull() ? null : n.asString();
        }
    }

    private Res call(String path, String token) throws IOException, InterruptedException {
        return call("GET", path, token, null);
    }

    private Res call(String method, String path, String token, String json) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json))
                .header("Content-Type", "application/json");
        if (token != null) {
            b.header("Authorization", "Bearer " + token);
        }
        HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
        return new Res(r.statusCode(), r.body().isEmpty() ? JSON.createObjectNode() : JSON.readTree(r.body()));
    }

    private String coach() throws Exception {
        String token = stub.coachToken("coach-" + UUID.randomUUID() + "@example.com");
        String signup = "{\"firstName\":\"Dana\",\"lastName\":\"Whitfield\",\"useLoginEmail\":true,\"businessEmail\":null"
                + ",\"phone\":\"(205) 555-0142\",\"coachTimezone\":\"America/Chicago\",\"currency\":\"USD\""
                + ",\"paymentInstructions\":\"Venmo or cash.\",\"paymentTypes\":[{\"type\":\"CASH\",\"on\":true}]}";
        assertThat(call("POST", "/api/coach/signup", token, signup).status()).isEqualTo(201);
        return token;
    }

    @Test
    void thisYearsPageAndLastYearsDownload() throws Exception {
        String token = coach();
        int thisYear = LocalDate.now(ZoneId.of("America/Chicago")).getYear();
        Res page = call("/api/coach/finances?year=" + thisYear, token);
        assertThat(page.status()).isEqualTo(200);
        assertThat(page.body().get("closed").asBoolean()).isFalse();
        assertThat(page.s("currency")).isEqualTo("USD");
        assertThat(page.body().get("paidLessons").asInt()).isZero();
        assertThat(page.body().get("months").get(0).get("month").asString()).isEqualTo(thisYear + "-01");

        Res last = call("/api/coach/finances/download?year=" + (thisYear - 1), token);
        assertThat(last.status()).isEqualTo(200);
        assertThat(last.s("fileName")).isEqualTo("bladebook-summary-" + (thisYear - 1) + ".csv");
        assertThat(last.s("csv")).startsWith("Month,Paid lessons,Gross received (USD),Of which for lessons in earlier years (USD),"
                        + "Taken off for earlier years' lessons marked unpaid (USD)\r\nJanuary " + (thisYear - 1) + ",0,0.00,0.00,0.00\r\n")
                .endsWith((thisYear - 1) + " total,0,0.00,0.00,0.00\r\n");
    }

    @Test
    void theJanuaryJobSavesLastYearOnceAndThePageCarriesTheUndoneFigures() throws Exception {
        String token = coach();
        int thisYear = LocalDate.now(ZoneId.of("America/Chicago")).getYear();
        Res first = call("POST", "/api/coach/local/jobs/year-close?date=" + thisYear + "-01-02", token, null);
        assertThat(first.status()).isEqualTo(200);
        assertThat(first.body().get("saved").asInt()).isGreaterThanOrEqualTo(1);    // the table is shared by this class's tests
        Res again = call("POST", "/api/coach/local/jobs/year-close?date=" + thisYear + "-01-03", token, null);
        assertThat(again.body().get("saved").asInt()).isZero();
        assertThat(again.body().get("alreadySaved").asInt()).isEqualTo(again.body().get("coaches").asInt());
        assertThat(call("POST", "/api/coach/local/jobs/year-close?date=soon", token, null).status()).isEqualTo(400);

        Res page = call("/api/coach/finances?year=" + thisYear, token);
        assertThat(page.body().get("undoneLessons").asInt()).isZero();
        assertThat(page.body().get("months").get(0).has("undoneGross")).isTrue();
        Res last = call("/api/coach/finances?year=" + (thisYear - 1), token);
        assertThat(last.body().get("closed").asBoolean()).isTrue();
        assertThat(last.body().get("months")).hasSize(12);
    }

    @Test
    void anotherYearIsRefused() throws Exception {
        String token = coach();
        Res r = call("/api/coach/finances?year=2001", token);
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("message")).isEqualTo("Pick this year or last year.");
        assertThat(call("/api/coach/finances/download?year=soon", token).status()).isEqualTo(400);
    }

    @Test
    void itNeedsACoachsSignIn() throws Exception {
        assertThat(call("/api/coach/finances?year=2026", null).status()).isEqualTo(401);
    }
}
