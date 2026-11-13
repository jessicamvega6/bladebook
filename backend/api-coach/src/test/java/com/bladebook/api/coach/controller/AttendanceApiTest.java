package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.LocalDynamo;
import com.bladebook.api.coach.security.LocalTokenStub;
import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleChange;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkatingOrg;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
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
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The rinkside page and the Lessons page over HTTP (Batch 7). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class AttendanceApiTest {

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

    @Value("${bladebook.auth.coach-app-client-id}")
    String coachClient;

    private String email;
    private String token;
    private AccessContext dana;
    private String ava;
    private LocalDate today;
    private LocalTime started;

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

    /** A coach with one skater booked into a lesson that started a few minutes ago, today in Chicago. */
    @BeforeEach
    void setUp() throws Exception {
        email = "coach-" + UUID.randomUUID() + "@example.com";
        token = stub.coachToken(email);
        call("POST", "/api/coach/signup", token, "{\"firstName\":\"Dana\",\"lastName\":\"Whitfield\",\"useLoginEmail\":true,"
                + "\"coachTimezone\":\"America/Chicago\",\"currency\":\"USD\",\"paymentTypes\":[]}");
        // The coach's ID is the token's subject, as Cognito's would be.
        String coachId = JSON.readTree(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1])).get("sub").asString();
        dana = new AccessContext(coachId);

        ZonedDateTime now = ZonedDateTime.now(CHICAGO);
        today = now.toLocalDate();
        started = now.toLocalTime().minusMinutes(5).withSecond(0).withNano(0);
        if (started.isAfter(now.toLocalTime())) { // just after midnight: use a time a minute in
            started = LocalTime.MIDNIGHT;
        }
        Instant startsAt = today.atTime(started).atZone(CHICAGO).toInstant();
        // Opened as if before it started, then booked, as booking needs a time that hasn't started.
        LessonTime t = new LessonTime(today, started, startsAt, "America/Chicago", 30, 5000, "USD", 0, 24, 1, 0, 1, IceType.PUBLIC, 1,
                LessonTime.Status.OPEN);
        new ScheduleRepository(clients, table).apply(dana, new ScheduleChange(List.of(t), List.of(), List.of()));

        ClientContext family = new ClientContext(UUID.randomUUID().toString());
        Skater k = new Skater(UUID.randomUUID().toString(), "Ava Park", true, SkatingOrg.USFS, "1234567");
        ava = k.studentId();
        FamilyProfile p = new FamilyProfile(family.clientId(), "Sarah", "Park", "sarah@example.com", "(205) 555-0196",
                ClientRelationship.GUARDIAN, Instant.now());
        StudentRecord r = new StudentRecord(coachId, ava, family.clientId(), StudentStatus.PENDING, k.name(), true, ClientRelationship.GUARDIAN,
                "Sarah Park", "sarah@example.com", "(205) 555-0196", SkatingOrg.USFS, "1234567", Instant.now());
        new FamilyRepository(clients, table).register(family, p, List.of(k), List.of(r), Map.of(coachId, new CoachName("Dana", "Whitfield")));
        new StudentRepository(clients, table).approve(dana, ava);
        new SyncRepository(clients, table).setLinkStatus(family.clientId(), coachId, ava, StudentStatus.ACTIVE);
        LinkedSkater linked = new ClientLinks(clients, table).requireActive(family, coachId, ava);
        BookingRepository bookings = new BookingRepository(clients, table);
        bookings.book(family, linked, bookings.times(family, linked.coach(), today, today).get(0), UUID.randomUUID().toString(),
                startsAt.minusSeconds(3600));
    }

    private String outcome(String outcome, Instant at) {
        return "{\"date\":\"" + today + "\",\"startTime\":\"" + started + "\",\"studentId\":\"" + ava + "\",\"outcome\":\"" + outcome
                + "\",\"outcomeAt\":\"" + at + "\"}";
    }

    @Test
    void todayRecordAndTheLessonsPageCorrection() throws Exception {
        Res day = call("GET", "/api/coach/rinkside/today", token, null);
        assertThat(day.status()).isEqualTo(200);
        assertThat(day.s("today")).isEqualTo(today.toString());
        JsonNode skater = day.body().get("lessons").get(0).get("skaters").get(0);
        assertThat(skater.get("shortName").asString()).isEqualTo("Ava P.");
        assertThat(skater.get("status").asString()).isEqualTo("BOOKED");

        Instant tap = Instant.now().minusSeconds(30);
        Res rec = call("POST", "/api/coach/rinkside/attendance", token, outcome("CHECKED_IN", tap));
        assertThat(rec.status()).isEqualTo(200);
        assertThat(rec.s("status")).isEqualTo("CHECKED_IN");
        assertThat(Instant.parse(rec.s("outcomeAt"))).isEqualTo(tap);

        Res list = call("GET", "/api/coach/lessons?from=" + today + "&to=" + today, token, null);
        assertThat(list.body()).hasSize(1);
        assertThat(list.body().get(0).get("skater").get("fullName").asString()).isEqualTo("Ava Park");

        Res fixed = call("PUT", "/api/coach/lessons/attendance", token, outcome("NO_SHOW", tap));
        assertThat(fixed.s("status")).isEqualTo("NO_SHOW");
    }

    @Test
    void aWrongClockIsRefusedAndContactDetailsAreFetchedForATap() throws Exception {
        Res wrong = call("POST", "/api/coach/rinkside/attendance", token, outcome("CHECKED_IN", Instant.now().plus(Duration.ofDays(2))));
        assertThat(wrong.status()).isEqualTo(400);
        assertThat(wrong.s("message")).isEqualTo("The phone’s time didn’t match the lesson, so it couldn’t be recorded.");

        Res contact = call("GET", "/api/coach/rinkside/contact/" + ava, token, null);
        assertThat(contact.status()).isEqualTo(200);
        assertThat(contact.s("clientName")).isEqualTo("Sarah Park");
        assertThat(contact.s("phone")).isEqualTo("(205) 555-0196");
    }

    @Test
    void theRinksidePageKeepsAFourHourSessionAndTheWebsiteSixtyMinutes() throws Exception {
        String twoHours = stub.token(email, List.of("Coach"), coachClient, Instant.now().minus(Duration.ofHours(2)));
        assertThat(call("GET", "/api/coach/rinkside/today", twoHours, null).status()).isEqualTo(200);
        Res site = call("GET", "/api/coach/lessons?from=" + today + "&to=" + today, twoHours, null);
        assertThat(site.status()).isEqualTo(401);
        assertThat(site.s("error")).isEqualTo("SIGN_IN_AGAIN");
        String fiveHours = stub.token(email, List.of("Coach"), coachClient, Instant.now().minus(Duration.ofHours(5)));
        assertThat(call("GET", "/api/coach/rinkside/today", fiveHours, null).status()).isEqualTo(401);
    }

    @Test
    void paymentsListMarkPaidWaiveAndUndo() throws Exception {
        Res list = call("GET", "/api/coach/payments?from=" + today + "&to=" + today, token, null);
        assertThat(list.status()).isEqualTo(200);
        assertThat(list.body().get("rows")).hasSize(1);
        JsonNode row = list.body().get("rows").get(0);
        assertThat(row.get("amountMinor").asInt()).isEqualTo(5000);
        assertThat(row.get("status").asString()).isEqualTo("UNPAID");
        assertThat(list.body().get("totals").get("unpaid").get("USD").asLong()).isEqualTo(5000);
        assertThat(list.body().get("choices").get(0).asString()).isEqualTo("OTHER");

        String seat = "{\"date\":\"" + today + "\",\"startTime\":\"" + started + "\",\"studentId\":\"" + ava + "\",\"paidVia\":\"OTHER\",\"paidViaOther\":\"Zelle\"}";
        Res paid = call("POST", "/api/coach/payments/paid", token, seat);
        assertThat(paid.s("status")).isEqualTo("PAID");
        assertThat(paid.s("paidVia")).isEqualTo("OTHER");
        assertThat(paid.s("paidViaOther")).isEqualTo("Zelle");
        assertThat(call("POST", "/api/coach/payments/waive", token, seat).status()).isEqualTo(409);
        assertThat(call("POST", "/api/coach/payments/undo", token, seat).s("status")).isEqualTo("UNPAID");
        assertThat(call("POST", "/api/coach/payments/waive", token, seat).s("status")).isEqualTo("WAIVED");
        Res again = call("POST", "/api/coach/payments/undo", token, seat);
        assertThat(again.status()).isEqualTo(409);
        assertThat(again.s("message")).isEqualTo("A waived lesson can’t be changed.");
    }
}
