package com.bladebook.api.client.controller;

import com.bladebook.api.client.LocalDynamo;
import com.bladebook.api.client.security.LocalTokenStub;
import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
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
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Family sign-up and the waiting family's account over HTTP (Batch 3). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class FamilyApiTest {

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

    @Autowired
    TenantClients clients;

    @Value("${bladebook.table}")
    String table;

    private AccessContext dana;
    private String code;
    private String token;

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
    void setUp() {
        dana = new AccessContext(UUID.randomUUID().toString());
        CoachCode c = CoachCode.generate(new SecureRandom());
        code = c.display();
        new CoachRepository(clients, table).create(dana, CoachProfile.builder().coachId(dana.coachId()).firstName("Dana")
                .lastName("Whitfield").loginEmail("dana@gmail.com").businessEmail("dana@gmail.com").phone("(205) 555-0142")
                .displayPhoneToClients(true).coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD)
                .coachCode(c).build());
        token = stub.familyToken("family-" + UUID.randomUUID() + "@example.com");
    }

    private String guardianSignUp(String number) {
        return "{\"firstName\":\"Sarah\",\"lastName\":\"Park\",\"phone\":\"(205) 555-0196\",\"relationship\":\"GUARDIAN\","
                + "\"coachCodes\":[\"" + code + "\"],\"skaters\":["
                + "{\"name\":\"Ava Park\",\"skatingOrg\":\"USFS\",\"registrationNumber\":\"1234567\",\"coachCodes\":[\"" + code + "\"]},"
                + "{\"name\":\"Jack Park\",\"skatingOrg\":\"USA_HOCKEY\",\"registrationNumber\":\"" + number + "\",\"coachCodes\":[\"" + code + "\"]}]}";
    }

    @Test
    void beforeSignInACodeGivesTheCoachsNameAndNothingElse() throws Exception {
        Res r = call("GET", "/api/client/coach-codes/" + code.toLowerCase(), null, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("firstName")).isEqualTo("Dana");
        assertThat(r.s("initials")).isEqualTo("DW");
        assertThat(r.raw()).doesNotContain(dana.coachId()).doesNotContain("555");
    }

    @Test
    void anUnknownOrMalformedCodeFindsNoCoach() throws Exception {
        Res unknown = call("GET", "/api/client/coach-codes/AAAA-AAAA", null, null);
        assertThat(unknown.status()).isEqualTo(404);
        assertThat(unknown.s("error")).isEqualTo("NO_COACH");
        assertThat(call("GET", "/api/client/coach-codes/MIA-4K7QX", null, null).status()).isEqualTo(404);
    }

    @Test
    void aGuardianSignsUpTwoChildrenAndWaits() throws Exception {
        Res r = call("POST", "/api/client/registration", token, guardianSignUp("2027 kq48 15mx 3t"));

        assertThat(r.status()).isEqualTo(201);
        assertThat(r.body().get("waiting").asBoolean()).isTrue();
        assertThat(r.body().get("skaters")).hasSize(2);
        assertThat(r.body().get("skaters").get(1).get("registrationNumber").asString()).isEqualTo("2027KQ4815MX3T");
        JsonNode coach = r.body().get("coaches").get(0);
        assertThat(coach.get("firstName").asString()).isEqualTo("Dana");
        assertThat(coach.get("status").asString()).isEqualTo("PENDING");
        assertThat(coach.get("details").isNull()).isTrue();
        assertThat(r.raw()).doesNotContain(dana.coachId()).doesNotContain("555-0142");

        assertThat(new StudentRepository(clients, table).list(dana)).hasSize(2);
        assertThat(call("GET", "/api/client/me", token, null).body().get("waiting").asBoolean()).isTrue();
    }

    @Test
    void signingUpTwiceIsAConflict() throws Exception {
        assertThat(call("POST", "/api/client/registration", token, guardianSignUp("2027KQ4815MX3T")).status()).isEqualTo(201);
        assertThat(call("POST", "/api/client/registration", token, guardianSignUp("2027KQ4815MX3T")).status()).isEqualTo(409);
    }

    @Test
    void aBadNumberNamesTheSkaterAndTheShape() throws Exception {
        Res r = call("POST", "/api/client/registration", token, guardianSignUp("2027"));

        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("field")).isEqualTo("skaters.1.registrationNumber");
        assertThat(r.s("message")).isEqualTo("USA Hockey numbers are 14 characters: 9 digits and 5 letters.");
        assertThat(call("GET", "/api/client/me", token, null).status()).isEqualTo(404);
    }

    @Test
    void aFamilyThatHasntSignedUpHasNoAccount() throws Exception {
        Res r = call("GET", "/api/client/me", token, null);
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.s("error")).isEqualTo("NO_ACCOUNT");
    }

    @Test
    void onceApprovedTheCoachsChosenDetailsShow() throws Exception {
        call("POST", "/api/client/registration", token, guardianSignUp("2027KQ4815MX3T"));
        StudentRepository students = new StudentRepository(clients, table);
        StudentRecord ava = students.list(dana).stream().filter(s -> s.studentName().equals("Ava Park")).findFirst().orElseThrow();
        new StudentLinkService(new SyncRepository(clients, table)).approved(students.approve(dana, ava.studentId()));

        Res r = call("GET", "/api/client/me", token, null);

        assertThat(r.body().get("waiting").asBoolean()).isFalse();
        JsonNode coach = r.body().get("coaches").get(0);
        assertThat(coach.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(coach.get("waitingNames").get(0).asString()).isEqualTo("Jack Park");
        assertThat(coach.get("details").get("phone").asString()).isEqualTo("(205) 555-0142");
        assertThat(coach.get("details").get("email").isNull()).isTrue();
    }

    @Test
    void aContactChangeReachesTheCoach() throws Exception {
        call("POST", "/api/client/registration", token, guardianSignUp("2027KQ4815MX3T"));

        Res r = call("PUT", "/api/client/me/contact", token, "{\"firstName\":\"Sara\",\"lastName\":\"Park\",\"phone\":\"(205) 555-0100\"}");

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("contact").get("firstName").asString()).isEqualTo("Sara");
        assertThat(new StudentRepository(clients, table).list(dana))
                .allSatisfy(s -> assertThat(s.clientPhone()).isEqualTo("(205) 555-0100"));
    }

    @Test
    void aCoachsTokenOrNoTokenCantReachTheFamilyRoutes() throws Exception {
        String coach = stub.token("dana@gmail.com", List.of("Coach"), "local-coach-app", Instant.now());
        assertThat(call("GET", "/api/client/me", coach, null).status()).isEqualTo(403);
        assertThat(call("GET", "/api/client/me", null, null).status()).isEqualTo(401);
        String stale = stub.token("x@example.com", List.of("Client"), "local-family-app", Instant.now().minus(Duration.ofMinutes(61)));
        Res r = call("GET", "/api/client/me", stale, null);
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.s("error")).isEqualTo("SIGN_IN_AGAIN");
    }
}
