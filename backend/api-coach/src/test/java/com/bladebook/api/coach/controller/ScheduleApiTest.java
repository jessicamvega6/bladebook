package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.LocalDynamo;
import com.bladebook.api.coach.security.LocalTokenStub;
import org.junit.jupiter.api.BeforeEach;
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
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The weekly schedule and the coach's calendar over HTTP (Batch 2). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ScheduleApiTest {

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

    private String email;
    private String token;

    record Res(int status, JsonNode body) {
        String s(String field) {
            JsonNode n = body.get(field);
            return n == null || n.isNull() ? null : n.asString();
        }
    }

    private Res call(String method, String path, String bearer, String json) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json))
                .header("Content-Type", "application/json");
        if (bearer != null) {
            b.header("Authorization", "Bearer " + bearer);
        }
        HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
        return new Res(r.statusCode(), r.body().isEmpty() ? JSON.createObjectNode() : JSON.readTree(r.body()));
    }

    @BeforeEach
    void signUp() throws Exception {
        email = "coach-" + UUID.randomUUID() + "@example.com";
        token = stub.coachToken(email);
        Res r = call("POST", "/api/coach/signup", token, "{\"firstName\":\"Dana\",\"lastName\":\"Whitfield\",\"useLoginEmail\":true,"
                + "\"coachTimezone\":\"America/Chicago\",\"currency\":\"USD\",\"paymentTypes\":[]}");
        assertThat(r.status()).isEqualTo(201);
    }

    /** Every day 9–10 AM, one 60-minute lesson, $45.50, up to 2 skaters. */
    private static String everyDay(long version) {
        return "{\"scheduleVersion\":" + version + ",\"templates\":[{\"seq\":1,\"name\":\"Morning ice\",\"startTime\":\"09:00\","
                + "\"endTime\":\"10:00\",\"lessonMinutes\":60,\"priceMinor\":4550,\"maxSkaters\":2,\"iceType\":\"PUBLIC\","
                + "\"days\":[0,1,2,3,4,5,6],\"off\":{}}]}";
    }

    private static LocalDate nextSunday() {
        return LocalDate.now(ZoneId.of("America/Chicago")).with(TemporalAdjusters.next(java.time.DayOfWeek.SUNDAY));
    }

    private static String timeOff(LocalDate from, LocalDate to) {
        return "{\"kind\":\"TIME_OFF\",\"name\":\"Fall break\",\"startDate\":\"" + from + "\",\"endDate\":\"" + to + "\"}";
    }

    @Test
    void timeOffPreviewsSavesAndShowsOnTheHubAndCalendar() throws Exception {
        call("PUT", "/api/coach/schedule", token, everyDay(0));
        LocalDate sunday = nextSunday();

        Res preview = call("POST", "/api/coach/schedule/temps/preview", token, timeOff(sunday, sunday.plusDays(1)));
        assertThat(preview.status()).isEqualTo(200);
        assertThat(preview.body().get("cancel")).isEmpty();
        assertThat(preview.body().get("families").asInt()).isZero();

        Res saved = call("POST", "/api/coach/schedule/temps", token, timeOff(sunday, sunday.plusDays(1)));
        assertThat(saved.status()).isEqualTo(200);
        assertThat(saved.s("tempId")).isNotBlank();
        assertThat(saved.s("displayName")).isEqualTo("Fall break");

        Res list = call("GET", "/api/coach/schedule/temps", token, null);
        assertThat(list.body()).hasSize(1);
        assertThat(list.body().get(0).get("kind").asString()).isEqualTo("TIME_OFF");

        Res cal = call("GET", "/api/coach/calendar?from=" + sunday + "&to=" + sunday.plusDays(2), token, null);
        JsonNode first = cal.body().get("days").get(0);
        assertThat(first.get("lessons")).isEmpty();
        assertThat(first.get("special").get("name").asString()).isEqualTo("Fall break");
        assertThat(cal.body().get("days").get(2).get("special").isNull()).isTrue();
        assertThat(cal.body().get("days").get(2).get("lessons")).hasSize(1);

        Res overlap = call("POST", "/api/coach/schedule/temps/preview", token, timeOff(sunday.plusDays(1), sunday.plusDays(3)));
        assertThat(overlap.status()).isEqualTo(400);
        assertThat(overlap.s("message")).startsWith("These dates overlap Fall break");

        Res before = call("GET", "/api/coach/schedule/temps/" + saved.s("tempId") + "/delete-preview", token, null);
        assertThat(before.status()).isEqualTo(200);
        assertThat(before.body().get("cancel")).isEmpty();
        assertThat(call("DELETE", "/api/coach/schedule/temps/" + saved.s("tempId"), token, null).status()).isEqualTo(200);
        assertThat(call("GET", "/api/coach/schedule/temps", token, null).body()).isEmpty();
        Res back = call("GET", "/api/coach/calendar?from=" + sunday + "&to=" + sunday, token, null);
        assertThat(back.body().get("days").get(0).get("lessons")).hasSize(1);
    }

    @Test
    void aSpecialScheduleIsSavedWithItsBlocksAndCanBeOpenedToEdit() throws Exception {
        LocalDate sunday = nextSunday();
        String body = "{\"kind\":\"SPECIAL\",\"name\":\"Camp\",\"startDate\":\"" + sunday + "\",\"endDate\":\"" + sunday.plusDays(1)
                + "\",\"templates\":[{\"seq\":1,\"name\":\"Camp ice\",\"startTime\":\"09:00\",\"endTime\":\"11:00\",\"lessonMinutes\":60,"
                + "\"priceMinor\":8000,\"maxSkaters\":1,\"iceType\":\"PUBLIC\",\"days\":[],\"off\":{\"" + sunday.plusDays(1) + "\":[\"10:00\"]}}]}";
        Res saved = call("POST", "/api/coach/schedule/temps", token, body);
        assertThat(saved.status()).isEqualTo(200);
        Res one = call("GET", "/api/coach/schedule/temps/" + saved.s("tempId"), token, null);
        assertThat(one.body().get("templates").get(0).get("off").get(sunday.plusDays(1).toString()).get(0).asString()).isEqualTo("10:00");

        Res cal = call("GET", "/api/coach/calendar?from=" + sunday + "&to=" + sunday.plusDays(1), token, null);
        assertThat(cal.body().get("days").get(0).get("lessons")).hasSize(2);
        assertThat(cal.body().get("days").get(1).get("lessons")).hasSize(1);
    }

    @Test
    void theWeeklyPreviewWarnsOfABigPriceChangeAndTheStatusSaysNothingHasRunYet() throws Exception {
        call("PUT", "/api/coach/schedule", token, everyDay(0));
        Res r = call("POST", "/api/coach/schedule/preview", token, everyDay(1).replace("4550", "455"));
        assertThat(r.status()).isEqualTo(200);
        JsonNode big = r.body().get("big").get(0);
        assertThat(big.get("fromMinor").asInt()).isEqualTo(4550);
        assertThat(big.get("toMinor").asInt()).isEqualTo(455);
        assertThat(big.get("percent").asInt()).isEqualTo(90);
        assertThat(big.get("cut").asBoolean()).isTrue();
        assertThat(call("GET", "/api/coach/schedule/status", token, null).body().get("exists").asBoolean()).isFalse();
    }

    @Test
    void cancelRestOfAFutureWeekHoldsEveryOpenTimeAndTheScheduleStays() throws Exception {
        call("PUT", "/api/coach/schedule", token, everyDay(0));
        LocalDate sunday = nextSunday();

        Res r = call("POST", "/api/coach/calendar/cancel", token, "{\"scope\":\"WEEK\",\"weekStart\":\"" + sunday + "\"}");

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("openHeld").asInt()).isEqualTo(7);
        assertThat(r.body().get("cancelled").asInt()).isZero();
        assertThat(r.body().get("families").asInt()).isZero();
        Res cal = call("GET", "/api/coach/calendar?from=" + sunday + "&to=" + sunday.plusDays(13), token, null);
        for (int i = 0; i < 14; i++) {
            assertThat(cal.body().get("days").get(i).get("lessons").get(0).get("lessonStatus").asString()).isEqualTo(i < 7 ? "HELD" : "OPEN");
        }
        assertThat(call("GET", "/api/coach/schedule", token, null).body().get("scheduleVersion").asLong()).isEqualTo(1);
    }

    @Test
    void cancellingAnOpenTimeAsALessonFindsNothingToCancel() throws Exception {
        call("PUT", "/api/coach/schedule", token, everyDay(0));
        Res r = call("POST", "/api/coach/calendar/cancel", token, "{\"scope\":\"LESSON\",\"picks\":[{\"date\":\"" + nextSunday()
                + "\",\"startTime\":\"09:00\",\"after\":\"HOLD\"}]}");
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.s("message")).isEqualTo("These lessons have already started or were cancelled.");
    }

    @Test
    void aCancelWithNoScopeOrChoiceIsInvalid() throws Exception {
        assertThat(call("POST", "/api/coach/calendar/cancel", token, "{\"scope\":\"MONTH\"}").status()).isEqualTo(400);
        assertThat(call("POST", "/api/coach/calendar/cancel", token, "{\"scope\":\"DAY\",\"picks\":[{\"date\":\"" + nextSunday()
                + "\",\"startTime\":\"09:00\"}]}").s("message")).isEqualTo("Choose release or hold for each lesson.");
    }

    @Test
    void aNewCoachHasNoScheduleYet() throws Exception {
        Res r = call("GET", "/api/coach/schedule", token, null);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("scheduleVersion").asLong()).isZero();
        assertThat(r.body().get("templates").isEmpty()).isTrue();
    }

    @Test
    void savingTheWeekMakesTheLessonTimesTheCalendarShows() throws Exception {
        Res saved = call("PUT", "/api/coach/schedule", token, everyDay(0));

        assertThat(saved.status()).isEqualTo(200);
        assertThat(saved.body().get("scheduleVersion").asLong()).isEqualTo(1);
        JsonNode t = saved.body().get("templates").get(0);
        assertThat(t.get("name").asString()).isEqualTo("Morning ice");
        assertThat(t.get("days").size()).isEqualTo(7);
        assertThat(t.get("priceMinor").asInt()).isEqualTo(4550);

        LocalDate sunday = nextSunday();
        Res cal = call("GET", "/api/coach/calendar?from=" + sunday + "&to=" + sunday.plusDays(6), token, null);
        assertThat(cal.status()).isEqualTo(200);
        assertThat(cal.s("coachTimezone")).isEqualTo("America/Chicago");
        assertThat(cal.body().get("hasSchedule").asBoolean()).isTrue();
        assertThat(cal.body().get("days").size()).isEqualTo(7);
        JsonNode lesson = cal.body().get("days").get(0).get("lessons").get(0);
        assertThat(lesson.get("startTime").asString()).isEqualTo("09:00");
        assertThat(lesson.get("durationMinutes").asInt()).isEqualTo(60);
        assertThat(lesson.get("priceMinor").asInt()).isEqualTo(4550);
        assertThat(lesson.get("lessonStatus").asString()).isEqualTo("OPEN");
    }

    @Test
    void anInvalidWeekIsRefusedWithEveryProblem() throws Exception {
        Res r = call("PUT", "/api/coach/schedule", token, "{\"scheduleVersion\":0,\"templates\":[{\"seq\":1,\"name\":\"\","
                + "\"startTime\":null,\"endTime\":null,\"lessonMinutes\":null,\"priceMinor\":5000,\"maxSkaters\":1,"
                + "\"iceType\":null,\"days\":[],\"off\":{}}]}");
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("field")).isEqualTo("blocks");
        assertThat(r.s("message").split("\n")).containsExactly("Block 1 needs a start time.", "Block 1 needs a lesson length.",
                "Block 1 has no days selected. Pick at least one day.", "Block 1 has no ice type. Pick one.");
    }

    @Test
    void aSaveFromAStaleWindowIsAConflict() throws Exception {
        assertThat(call("PUT", "/api/coach/schedule", token, everyDay(0)).status()).isEqualTo(200);
        Res r = call("PUT", "/api/coach/schedule", token, everyDay(0));
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.s("message")).contains("changed in another window");
    }

    @Test
    void savingNeedsASignInFromTheLastFifteenMinutes() throws Exception {
        String sixteen = stub.token(email, List.of("Coach"), "local-coach-app", Instant.now().minus(Duration.ofMinutes(16)));

        Res r = call("PUT", "/api/coach/schedule", sixteen, everyDay(0));

        assertThat(r.status()).isEqualTo(401);
        assertThat(r.s("error")).isEqualTo("SIGN_IN_TO_SAVE");
        assertThat(call("GET", "/api/coach/schedule", sixteen, null).status()).isEqualTo(200); // reading is fine
        assertThat(call("GET", "/api/coach/schedule", token, null).body().get("scheduleVersion").asLong()).isZero();
    }

    @Test
    void timesMustBeOnTheQuarterHour() throws Exception {
        Res r = call("PUT", "/api/coach/schedule", token, everyDay(0).replace("\"09:00\"", "\"09:10\""));
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("field")).isEqualTo("startTime");
    }

    @Test
    void anUnreadableTimeOrDayIsInvalid() throws Exception {
        assertThat(call("PUT", "/api/coach/schedule", token, everyDay(0).replace("\"09:00\"", "\"9am\"")).status()).isEqualTo(400);
        assertThat(call("PUT", "/api/coach/schedule", token, everyDay(0).replace("[0,1,2,3,4,5,6]", "[7]")).status()).isEqualTo(400);
        assertThat(call("PUT", "/api/coach/schedule", token, everyDay(0).replace("\"PUBLIC\"", "\"OUTDOOR\"")).status()).isEqualTo(400);
    }

    @Test
    void theCalendarTakesAtMostSixWeeks() throws Exception {
        LocalDate sunday = nextSunday();
        assertThat(call("GET", "/api/coach/calendar?from=" + sunday + "&to=" + sunday.plusDays(42), token, null).status()).isEqualTo(400);
        assertThat(call("GET", "/api/coach/calendar?from=" + sunday + "&to=nope", token, null).status()).isEqualTo(400);
    }

    @Test
    void aFamilysTokenCantReachTheScheduleOrCalendar() throws Exception {
        String family = stub.token(email, List.of("Client"), "local-coach-app", Instant.now());
        assertThat(call("GET", "/api/coach/schedule", family, null).status()).isEqualTo(403);
        assertThat(call("PUT", "/api/coach/schedule", family, everyDay(0)).status()).isEqualTo(403);
        assertThat(call("GET", "/api/coach/calendar?from=2026-11-08&to=2026-11-14", family, null).status()).isEqualTo(403);
        assertThat(call("GET", "/api/coach/schedule", null, null).status()).isEqualTo(401);
    }
}
