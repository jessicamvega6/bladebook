package com.bladebook.api.client.controller;

import com.bladebook.api.client.LocalDynamo;
import com.bladebook.api.client.security.LocalTokenStub;
import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.service.StudentLinkService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Booking one lesson over HTTP (Batch 4). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class BookingApiTest {

    @DynamicPropertySource
    static void dynamo(DynamicPropertyRegistry registry) {
        LocalDynamo.register(registry);
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final ZoneId CHICAGO = ZoneId.of("America/Chicago");

    @LocalServerPort
    int port;

    @Autowired
    LocalTokenStub stub;

    @Autowired
    TenantClients clients;

    @Value("${bladebook.table}")
    String table;

    private AccessContext dana;
    private String code;
    private String token;
    /** Two days from now in Chicago: always inside the booking window. */
    private LocalDate day;

    record Res(int status, JsonNode body, String raw) {
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
        return new Res(r.statusCode(), r.body().isEmpty() ? JSON.createObjectNode() : JSON.readTree(r.body()), r.body());
    }

    @BeforeEach
    void setUp() throws Exception {
        dana = new AccessContext(UUID.randomUUID().toString());
        CoachCode c = CoachCode.generate(new SecureRandom());
        code = c.display();
        new CoachRepository(clients, table).create(dana, CoachProfile.builder().coachId(dana.coachId()).firstName("Dana")
                .lastName("Whitfield").loginEmail("dana@gmail.com").businessEmail("dana@gmail.com").phone("(205) 555-0142")
                .coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD).coachCode(c).build());
        day = LocalDate.now(CHICAGO).plusDays(2);
        open(LocalTime.of(10, 0));
        open(LocalTime.of(10, 30));
        token = stub.familyToken("family-" + UUID.randomUUID() + "@example.com");
        call("POST", "/api/client/registration", token, signUp());
    }

    private void open(LocalTime start) {
        LessonTime t = new LessonTime(day, start, day.atTime(start).atZone(CHICAGO).toInstant(), "America/Chicago", 30, 5000, "USD",
                0, 24, 1, 0, 1, IceType.PUBLIC, 1, LessonTime.Status.OPEN);
        new ScheduleRepository(clients, table).apply(dana, new ScheduleChange(List.of(t), List.of(), List.of()));
    }

    private String signUp() {
        return "{\"firstName\":\"Sarah\",\"lastName\":\"Park\",\"phone\":\"(205) 555-0196\",\"relationship\":\"GUARDIAN\","
                + "\"coachCodes\":[\"" + code + "\"],\"skaters\":["
                + "{\"name\":\"Ava Park\",\"skatingOrg\":\"USFS\",\"registrationNumber\":\"1234567\",\"coachCodes\":[\"" + code + "\"]},"
                + "{\"name\":\"Jack Park\",\"skatingOrg\":\"USFS\",\"registrationNumber\":\"7654321\",\"coachCodes\":[\"" + code + "\"]}]}";
    }

    private void approve(String name) {
        StudentRepository students = new StudentRepository(clients, table);
        StudentRecord r = students.list(dana).stream().filter(s -> s.studentName().equals(name)).findFirst().orElseThrow();
        new StudentLinkService(new SyncRepository(clients, table)).approved(students.approve(dana, r.studentId()));
    }

    private String skaterId(String name) throws Exception {
        for (JsonNode k : call("GET", "/api/client/me", token, null).body().get("skaters")) {
            if (k.get("name").asString().equals(name)) {
                return k.get("studentId").asString();
            }
        }
        throw new AssertionError(name);
    }

    private String bookBody(String studentId, String key, String... times) {
        StringBuilder picks = new StringBuilder();
        for (String t : times) {
            picks.append(picks.length() == 0 ? "" : ",").append("{\"date\":\"").append(day).append("\",\"startTime\":\"").append(t).append("\"}");
        }
        return "{\"coachId\":\"" + dana.coachId() + "\",\"studentId\":\"" + studentId + "\",\"idempotencyKey\":\"" + key
                + "\",\"picks\":[" + picks + "]}";
    }

    @Test
    void anApprovedFamilyGetsItsSkaterAndCoachIdsButAWaitingCoachsIdStaysHidden() throws Exception {
        Res waiting = call("GET", "/api/client/me", token, null);
        assertThat(waiting.raw()).doesNotContain(dana.coachId());
        assertThat(waiting.body().get("skaters").get(0).get("studentId").asString()).isNotBlank();

        approve("Ava Park");
        Res approved = call("GET", "/api/client/me", token, null);
        assertThat(approved.body().get("coaches").get(0).get("coachId").asString()).isEqualTo(dana.coachId());
    }

    @Test
    void theBookingPageShowsTheTimesFreeOrTakenWithNoNames() throws Exception {
        approve("Ava Park");
        Res r = call("GET", "/api/client/booking?coachId=" + dana.coachId() + "&studentId=" + skaterId("Ava Park"), token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("coachFirstName")).isEqualTo("Dana");
        assertThat(r.s("coachTimezone")).isEqualTo("America/Chicago");
        assertThat(r.body().get("requiredNoticeHours").asInt()).isEqualTo(24);
        assertThat(r.body().get("times")).hasSize(2);
        JsonNode first = r.body().get("times").get(0);
        assertThat(first.get("date").asString()).isEqualTo(day.toString());
        assertThat(first.get("startTime").asString()).isEqualTo("10:00");
        assertThat(first.get("endTime").asString()).isEqualTo("10:30");
        assertThat(first.get("priceMinor").asInt()).isEqualTo(5000);
        assertThat(first.get("free").asBoolean()).isTrue();
    }

    @Test
    void bookingReportsEachPickAndARetryWithTheSameKeyBooksNothingTwice() throws Exception {
        approve("Ava Park");
        String ava = skaterId("Ava Park");
        String key = UUID.randomUUID().toString();

        Res r = call("POST", "/api/client/bookings", token, bookBody(ava, key, "10:00", "11:00"));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("studentName")).isEqualTo("Ava Park");
        JsonNode picks = r.body().get("picks");
        assertThat(picks.get(0).get("outcome").asString()).isEqualTo("BOOKED");
        assertThat(picks.get(0).get("priceMinor").asInt()).isEqualTo(5000);
        assertThat(picks.get(1).get("outcome").asString()).isEqualTo("UNAVAILABLE");
        assertThat(picks.get(1).get("message").asString()).isEqualTo("That time was taken or no longer exists.");

        Res again = call("POST", "/api/client/bookings", token, bookBody(ava, key, "10:00"));
        assertThat(again.body().get("picks").get(0).get("outcome").asString()).isEqualTo("BOOKED");
        Res other = call("POST", "/api/client/bookings", token, bookBody(ava, UUID.randomUUID().toString(), "10:00"));
        assertThat(other.body().get("picks").get(0).get("outcome").asString()).isEqualTo("ALREADY_BOOKED");

        assertThat(new ScheduleRepository(clients, table).seats(dana, day, day)).hasSize(1);
        Res page = call("GET", "/api/client/booking?coachId=" + dana.coachId() + "&studentId=" + ava, token, null);
        assertThat(page.body().get("times").get(0).get("free").asBoolean()).isFalse();
        assertThat(page.body().get("familyLessons").get(0).get("studentName").asString()).isEqualTo("Ava Park");
    }

    @Test
    void homeListsTheFamilysLessonsFromTodayOn() throws Exception {
        approve("Ava Park");
        call("POST", "/api/client/bookings", token, bookBody(skaterId("Ava Park"), UUID.randomUUID().toString(), "10:30"));

        Res r = call("GET", "/api/client/lessons", token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body()).hasSize(1);
        JsonNode l = r.body().get(0);
        assertThat(l.get("coachFirstName").asString()).isEqualTo("Dana");
        assertThat(l.get("studentName").asString()).isEqualTo("Ava Park");
        assertThat(l.get("startTime").asString()).isEqualTo("10:30");
        assertThat(Instant.parse(l.get("startsAtUtc").asString())).isEqualTo(day.atTime(10, 30).atZone(CHICAGO).toInstant());
    }

    @Test
    void aSkaterStillWaitingIsRefusedWithTheProductWording() throws Exception {
        approve("Ava Park");
        Res r = call("POST", "/api/client/bookings", token, bookBody(skaterId("Jack Park"), UUID.randomUUID().toString(), "10:00"));
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.s("message")).isEqualTo("Jack’s lessons are no longer available to book. Contact Coach Dana.");
    }

    @Test
    void aSkaterThatWasNeverTheFamilysIsAPlainNotFoundNotAMissingAccount() throws Exception {
        approve("Ava Park");
        Res r = call("POST", "/api/client/bookings", token, bookBody(UUID.randomUUID().toString(), UUID.randomUUID().toString(), "10:00"));
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.s("error")).isEqualTo("NOT_FOUND");
        assertThat(call("GET", "/api/client/booking?coachId=" + UUID.randomUUID() + "&studentId=" + skaterId("Ava Park"), token, null)
                .status()).isEqualTo(404);
    }

    @Test
    void aPickPastTheWindowRefusesTheWholeRequest() throws Exception {
        approve("Ava Park");
        String late = LocalDate.now(CHICAGO).plusMonths(4).toString();
        String body = "{\"coachId\":\"" + dana.coachId() + "\",\"studentId\":\"" + skaterId("Ava Park") + "\",\"idempotencyKey\":\""
                + UUID.randomUUID() + "\",\"picks\":[{\"date\":\"" + day + "\",\"startTime\":\"10:00\"},{\"date\":\"" + late
                + "\",\"startTime\":\"10:00\"}]}";
        Res r = call("POST", "/api/client/bookings", token, body);
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("message")).isEqualTo("That date is further ahead than you can book.");
        assertThat(new ScheduleRepository(clients, table).seats(dana, day, day)).isEmpty();
    }

    private String cancelBody(String studentId, String time) {
        return "{\"coachId\":\"" + dana.coachId() + "\",\"studentId\":\"" + studentId + "\",\"date\":\"" + day
                + "\",\"startTime\":\"" + time + "\"}";
    }

    @Test
    void myBookingsListsTheLessonWithItsPriceAndNoticePeriod() throws Exception {
        approve("Ava Park");
        call("POST", "/api/client/bookings", token, bookBody(skaterId("Ava Park"), UUID.randomUUID().toString(), "10:30"));

        Res r = call("GET", "/api/client/bookings", token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("upcoming")).hasSize(1);
        JsonNode l = r.body().get("upcoming").get(0);
        assertThat(l.get("studentName").asString()).isEqualTo("Ava Park");
        assertThat(l.get("priceMinor").asInt()).isEqualTo(5000);
        assertThat(l.get("currency").asString()).isEqualTo("USD");
        assertThat(l.get("requiredNoticeHours").asInt()).isEqualTo(24);
        assertThat(r.body().get("recent")).isEmpty();
    }

    @Test
    void cancellingFreesTheTimeAndAskingAgainIsAlreadyCancelled() throws Exception {
        approve("Ava Park");
        String ava = skaterId("Ava Park");
        call("POST", "/api/client/bookings", token, bookBody(ava, UUID.randomUUID().toString(), "10:00"));

        Res r = call("POST", "/api/client/bookings/cancel", token, cancelBody(ava, "10:00"));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("outcome")).isEqualTo("CANCELLED");
        assertThat(r.s("coachFirstName")).isEqualTo("Dana");
        assertThat(r.s("studentName")).isEqualTo("Ava Park");
        assertThat(r.body().get("late").isBoolean()).isTrue();

        assertThat(new ScheduleRepository(clients, table).seats(dana, day, day)).isEmpty();
        Res page = call("GET", "/api/client/booking?coachId=" + dana.coachId() + "&studentId=" + ava, token, null);
        assertThat(page.body().get("times").get(0).get("free").asBoolean()).isTrue();
        assertThat(call("GET", "/api/client/bookings", token, null).body().get("upcoming")).isEmpty();

        assertThat(call("POST", "/api/client/bookings/cancel", token, cancelBody(ava, "10:00")).s("outcome")).isEqualTo("ALREADY_CANCELLED");
    }

    @Test
    void cancellingSomeoneElsesSkaterIsAPlainNotFound() throws Exception {
        approve("Ava Park");
        Res r = call("POST", "/api/client/bookings/cancel", token, cancelBody(UUID.randomUUID().toString(), "10:00"));
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.s("error")).isEqualTo("NOT_FOUND");
    }

    @Test
    void aBadDateIsRefused() throws Exception {
        approve("Ava Park");
        String body = "{\"coachId\":\"" + dana.coachId() + "\",\"studentId\":\"" + skaterId("Ava Park")
                + "\",\"date\":\"soon\",\"startTime\":\"10:00\"}";
        assertThat(call("POST", "/api/client/bookings/cancel", token, body).status()).isEqualTo(400);
    }

    @Test
    void aRepeatingBookingIsListedAsASeriesAndCanBeStopped() throws Exception {
        approve("Ava Park");
        String ava = skaterId("Ava Park");
        // The lesson times exist on one day only, so the series books its first date and reports the rest unavailable.
        String body = "{\"coachId\":\"" + dana.coachId() + "\",\"studentId\":\"" + ava + "\",\"idempotencyKey\":\"series-key-0001\","
                + "\"picks\":[{\"date\":\"" + day + "\",\"startTime\":\"10:00\"}],\"repeat\":true,\"everyWeeks\":1,\"until\":\"" + day.plusDays(14) + "\"}";
        Res r = call("POST", "/api/client/bookings", token, body);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("picks")).hasSize(3);
        assertThat(r.body().get("picks").get(0).get("outcome").asString()).isEqualTo("BOOKED");
        assertThat(r.body().get("picks").get(1).get("outcome").asString()).isEqualTo("UNAVAILABLE");
        String rid = r.body().get("series").get(0).get("recurrenceId").asString();

        Res mine = call("GET", "/api/client/bookings", token, null);
        assertThat(mine.body().get("series").get(0).get("lessonsLeft").asInt()).isEqualTo(1);
        assertThat(mine.body().get("upcoming").get(0).get("intervalWeeks").asInt()).isEqualTo(1);

        Res stop = call("POST", "/api/client/series/change", token, "{\"coachId\":\"" + dana.coachId() + "\",\"recurrenceId\":\"" + rid
                + "\",\"change\":\"STOP\"}");
        assertThat(stop.status()).isEqualTo(200);
        assertThat(stop.s("status")).isEqualTo("ENDED");
        assertThat(call("GET", "/api/client/bookings", token, null).body().get("series")).isEmpty();

        Res wrong = call("POST", "/api/client/bookings", token, body.replace("\"everyWeeks\":1", "\"everyWeeks\":6"));
        assertThat(wrong.status()).isEqualTo(400);
        assertThat(wrong.s("message")).isEqualTo("Pick how often it repeats.");
    }

    @Test
    void noTokenCantBook() throws Exception {
        assertThat(call("POST", "/api/client/bookings", null, "{}").status()).isEqualTo(401);
    }
}
