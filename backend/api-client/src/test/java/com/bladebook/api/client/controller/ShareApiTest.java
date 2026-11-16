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
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Shared lessons over HTTP (Batch 11): share codes on Profile, the share-check, booking with a code, and the answer. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ShareApiTest {

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
    private String park;
    private String chen;
    private LocalDate day;

    record Res(int status, JsonNode body, String raw) {
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
        day = LocalDate.now(CHICAGO).plusDays(5);
        LessonTime t = new LessonTime(day, LocalTime.of(10, 0), day.atTime(10, 0).atZone(CHICAGO).toInstant(), "America/Chicago", 30, 5000,
                "USD", 0, 24, 2, 0, 1, IceType.PUBLIC, 1, LessonTime.Status.OPEN);
        new ScheduleRepository(clients, table).apply(dana, new ScheduleChange(List.of(t), List.of(), List.of()));
        park = stub.familyToken("park-" + UUID.randomUUID() + "@example.com");
        chen = stub.familyToken("chen-" + UUID.randomUUID() + "@example.com");
        call("POST", "/api/client/registration", park, signUp("Sarah", "Park", "Ava Park"));
        call("POST", "/api/client/registration", chen, signUp("Grace", "Chen", "Mia Chen"));
        approve("Ava Park");
        approve("Mia Chen");
    }

    private String signUp(String first, String last, String kid) {
        return "{\"firstName\":\"" + first + "\",\"lastName\":\"" + last + "\",\"phone\":\"(205) 555-0196\",\"relationship\":\"GUARDIAN\","
                + "\"coachCodes\":[\"" + code + "\"],\"skaters\":[{\"name\":\"" + kid + "\",\"skatingOrg\":\"USFS\","
                + "\"registrationNumber\":\"1234567\",\"coachCodes\":[\"" + code + "\"]}]}";
    }

    private void approve(String name) {
        StudentRepository students = new StudentRepository(clients, table);
        StudentRecord r = students.list(dana).stream().filter(s -> s.studentName().equals(name)).findFirst().orElseThrow();
        new StudentLinkService(new SyncRepository(clients, table)).approved(students.approve(dana, r.studentId()));
    }

    private JsonNode skater(String token) throws Exception {
        return call("GET", "/api/client/me", token, null).body().get("skaters").get(0);
    }

    @Test
    void everySkaterHasAShareCodeOnTheProfile() throws Exception {
        assertThat(skater(park).get("shareCode").asString()).matches("AVA-[A-Z0-9]{5}");
    }

    @Test
    void theShareCheckAnswersANameAndTheRosterAndNeverAnId() throws Exception {
        String miaCode = skater(chen).get("shareCode").asString();
        Res r = call("POST", "/api/client/share-check", park, "{\"shareCode\":\"" + miaCode + "\",\"coachId\":\"" + dana.coachId() + "\"}");
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("displayName").asString()).isEqualTo("Mia C.");
        assertThat(r.body().get("onCoachRoster").asBoolean()).isTrue();
        assertThat(r.raw()).doesNotContain(skater(chen).get("studentId").asString());

        Res none = call("POST", "/api/client/share-check", park, "{\"shareCode\":\"MIA-22222\",\"coachId\":\"" + dana.coachId() + "\"}");
        assertThat(none.status()).isEqualTo(404);
    }

    @Test
    void bookingWithACodeInvitesAndTheOtherFamilyGoesAhead() throws Exception {
        String ava = skater(park).get("studentId").asString();
        String miaCode = skater(chen).get("shareCode").asString();
        Res booked = call("POST", "/api/client/bookings", park, "{\"coachId\":\"" + dana.coachId() + "\",\"studentId\":\"" + ava
                + "\",\"idempotencyKey\":\"" + UUID.randomUUID() + "\",\"picks\":[{\"date\":\"" + day + "\",\"startTime\":\"10:00\"}],"
                + "\"shareCode\":\"" + miaCode + "\"}");
        assertThat(booked.status()).isEqualTo(200);
        assertThat(booked.body().get("shared").get("displayName").asString()).isEqualTo("Mia C.");

        Res inv = call("GET", "/api/client/invitations", chen, null);
        assertThat(inv.body()).hasSize(1);
        JsonNode i = inv.body().get(0);
        assertThat(i.get("hostName").asString()).isEqualTo("Ava P.");
        assertThat(i.get("shareMinor").asInt()).isEqualTo(2500);

        Res ok = call("POST", "/api/client/invitations/accept", chen, "{\"inviteId\":\"" + i.get("inviteId").asString() + "\"}");
        assertThat(ok.status()).isEqualTo(200);
        JsonNode mine = call("GET", "/api/client/bookings", chen, null).body().get("upcoming").get(0);
        assertThat(mine.get("priceMinor").asInt()).isEqualTo(2500);
        assertThat(mine.get("share").get("joined").asBoolean()).isTrue();
        JsonNode theirs = call("GET", "/api/client/bookings", park, null).body().get("upcoming").get(0);
        assertThat(theirs.get("share").get("partnerStatus").asString()).isEqualTo("BOOKED");
    }

    @Test
    void theLocalSweepRunsOnRequest() throws Exception {
        assertThat(call("POST", "/api/client/local/sweep", park, null).status()).isEqualTo(200);
    }
}
