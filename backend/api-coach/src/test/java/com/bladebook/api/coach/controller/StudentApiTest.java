package com.bladebook.api.coach.controller;

import com.bladebook.api.coach.LocalDynamo;
import com.bladebook.api.coach.security.LocalTokenStub;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.domain.RegistrationNumbers;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.RegistrationRequest.SkaterRequest;
import com.bladebook.core.domain.RegistrationRules;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.service.FamilyService;
import com.bladebook.core.service.RegistrationService;
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
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The coach's Students and Waiting for approval tabs over HTTP (Batch 3). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class StudentApiTest {

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

    private String token;
    private String code;
    private ClientContext family;

    record Res(int status, JsonNode body) {
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

    /** A coach whose code works (login email used as the business email), and a family of two waiting for them. */
    @BeforeEach
    void setUp() throws Exception {
        token = stub.coachToken("coach-" + UUID.randomUUID() + "@example.com");
        Res signup = call("POST", "/api/coach/signup", token, "{\"firstName\":\"Dana\",\"lastName\":\"Whitfield\",\"useLoginEmail\":true,"
                + "\"coachTimezone\":\"America/Chicago\",\"currency\":\"USD\",\"paymentTypes\":[]}");
        assertThat(signup.status()).isEqualTo(201);
        code = signup.body().get("coachCode").asString();
        family = signUpFamily("Ava Park", "Jack Park");
    }

    private ClientContext signUpFamily(String... kids) {
        ClientContext ctx = new ClientContext(UUID.randomUUID().toString());
        FamilyRepository families = new FamilyRepository(clients, table);
        RegistrationService reg = new RegistrationService(new CodeRepository(clients, table), families,
                new RegistrationRules(RegistrationNumbers.withoutSeasonCheck()), new FamilyService(families),
                () -> UUID.randomUUID().toString(), Clock.systemUTC());
        List<SkaterRequest> ks = java.util.Arrays.stream(kids).map(k -> new SkaterRequest(k, "USFS", "1234567", List.of(code))).toList();
        reg.register(ctx, "sarah@example.com", new RegistrationRequest("Sarah", "Park", "(205) 555-0196", "GUARDIAN", List.of(code), ks));
        return ctx;
    }

    private List<String> pendingIds() throws Exception {
        JsonNode p = call("GET", "/api/coach/students", token, null).body().get("pending");
        List<String> ids = new java.util.ArrayList<>();
        p.forEach(n -> ids.add(n.get("studentId").asString()));
        return ids;
    }

    private StudentStatus linkOf(String name) {
        return new FamilyRepository(clients, table).account(family).orElseThrow().links().stream()
                .filter(l -> l.studentName().equals(name)).findFirst().map(l -> l.status()).orElse(null);
    }

    @Test
    void aNewFamilyWaitsWithItsContactDetailsAndNumbers() throws Exception {
        Res r = call("GET", "/api/coach/students", token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("active")).isEmpty();
        JsonNode ava = r.body().get("pending").get(0);
        assertThat(ava.get("clientName").asString()).isEqualTo("Sarah Park");
        assertThat(ava.get("clientEmail").asString()).isEqualTo("sarah@example.com");
        assertThat(ava.get("skatingOrg").asString()).isEqualTo("USFS");
        assertThat(ava.get("relationship").asString()).isEqualTo("GUARDIAN");
    }

    @Test
    void approvingOneSkaterReachesTheFamily() throws Exception {
        String first = pendingIds().get(0);

        Res r = call("POST", "/api/coach/students/approve", token, "{\"studentIds\":[\"" + first + "\"]}");

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("active")).hasSize(1);
        assertThat(r.body().get("pending")).hasSize(1);
        String name = r.body().get("active").get(0).get("studentName").asString();
        assertThat(linkOf(name)).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void approveAllApprovesTheWholeFamily() throws Exception {
        List<String> ids = pendingIds();
        Res r = call("POST", "/api/coach/students/approve", token,
                "{\"studentIds\":[\"" + ids.get(0) + "\",\"" + ids.get(1) + "\"]}");

        assertThat(r.body().get("active")).hasSize(2);
        assertThat(linkOf("Ava Park")).isEqualTo(StudentStatus.ACTIVE);
        assertThat(linkOf("Jack Park")).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void decliningRemovesTheSkaterAndTheFamilysLink() throws Exception {
        List<String> ids = pendingIds();

        Res r = call("DELETE", "/api/coach/students/" + ids.get(0), token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("pending")).hasSize(1);
        assertThat(new FamilyRepository(clients, table).account(family).orElseThrow().links()).hasSize(1);
    }

    @Test
    void decliningEmailsTheFamilyThroughTheLocalOutbox() throws Exception {
        String id = pendingIds().get(0);
        call("DELETE", "/api/coach/students/" + id, token, null);

        JsonNode sent = call("GET", "/api/coach/local/outbox", token, null).body();
        JsonNode declined = null;
        for (JsonNode s : sent) {
            JsonNode e = s.get("email");
            if (e.get("template").asString().equals("signup-declined") && e.get("data").get("coachBusinessEmail").asString().startsWith("coach-")) {
                declined = e;
                break;
            }
        }
        assertThat(declined).isNotNull();
        assertThat(declined.get("to").asString()).isEqualTo("sarah@example.com");
        assertThat(declined.get("fromName").asString()).isEqualTo("Dana Whitfield via BladeBook");
    }

    @Test
    void theJobsRunForTheDateGiven() throws Exception {
        Res r = call("POST", "/api/coach/local/jobs/day-reminder?date=2031-01-06", token, null);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("reminders").asInt()).isZero();
        assertThat(call("POST", "/api/coach/local/jobs/unpaid-reminder?date=2031-01-06", token, null).status()).isEqualTo(200);
        assertThat(call("POST", "/api/coach/local/jobs/day-reminder?date=Monday", token, null).status()).isEqualTo(400);
        assertThat(call("POST", "/api/coach/local/jobs/day-reminder", null, null).status()).isEqualTo(401);
    }

    @Test
    void anApprovedSkaterCantBeDeclined() throws Exception {
        String id = pendingIds().get(0);
        call("POST", "/api/coach/students/approve", token, "{\"studentIds\":[\"" + id + "\"]}");

        assertThat(call("DELETE", "/api/coach/students/" + id, token, null).status()).isEqualTo(409);
    }

    @Test
    void anotherCoachCantApproveOrDeclineThisCoachsSkater() throws Exception {
        String id = pendingIds().get(0);
        String other = stub.coachToken("other-" + UUID.randomUUID() + "@example.com");

        assertThat(call("POST", "/api/coach/students/approve", other, "{\"studentIds\":[\"" + id + "\"]}").status()).isEqualTo(409);
        assertThat(call("DELETE", "/api/coach/students/" + id, other, null).status()).isEqualTo(409);
        assertThat(pendingIds()).contains(id);
    }

    @Test
    void approvingNothingIsInvalid() throws Exception {
        assertThat(call("POST", "/api/coach/students/approve", token, "{\"studentIds\":[]}").status()).isEqualTo(400);
    }

    @Test
    void aFamilysTokenCantReachTheStudentList() throws Exception {
        String famToken = stub.token("sarah@example.com", List.of("Client"), "local-coach-app", Instant.now());
        assertThat(call("GET", "/api/coach/students", famToken, null).status()).isEqualTo(403);
        assertThat(call("GET", "/api/coach/students", null, null).status()).isEqualTo(401);
    }
}
