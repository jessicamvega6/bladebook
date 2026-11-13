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
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** api-coach end to end over HTTP: token checks, sign-up step 3, the profile and the coach code. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ProfileApiTest {

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

    private static String newEmail() {
        return "coach-" + UUID.randomUUID() + "@example.com";
    }

    private static String signup(boolean useLogin, String businessEmail) {
        return "{\"firstName\":\"Dana\",\"lastName\":\"Whitfield\",\"useLoginEmail\":" + useLogin
                + ",\"businessEmail\":" + (businessEmail == null ? "null" : "\"" + businessEmail + "\"")
                + ",\"phone\":\"(205) 555-0142\",\"coachTimezone\":\"America/Chicago\",\"currency\":\"USD\""
                + ",\"paymentInstructions\":\"Venmo or cash.\""
                + ",\"paymentTypes\":[{\"type\":\"CASH\",\"on\":true},{\"type\":\"VENMO\",\"on\":true,\"handle\":\"@dana\"}]}";
    }

    // ---- open routes ----

    @Test
    void healthNeedsNoToken() throws Exception {
        Res r = call("GET", "/api/coach/health", null, null);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("status")).isEqualTo("ok");
    }

    @Test
    void theLocalStubIssuesACoachToken() throws Exception {
        Res r = call("POST", "/api/coach/local/token", null, "{\"loginEmail\":\"dana@example.com\"}");
        assertThat(r.status()).isEqualTo(200);
        assertThat(call("GET", "/api/coach/profile", r.s("idToken"), null).status()).isEqualTo(404);
    }

    @Test
    void theLocalStubRefusesABadEmail() throws Exception {
        assertThat(call("POST", "/api/coach/local/token", null, "{\"loginEmail\":\"dana\"}").status()).isEqualTo(400);
    }

    // ---- token checks (ADR-MASTER section 15) ----

    @Test
    void noTokenIsUnauthorised() throws Exception {
        assertThat(call("GET", "/api/coach/profile", null, null).status()).isEqualTo(401);
    }

    @Test
    void aForgedTokenIsUnauthorised() throws Exception {
        String token = stub.coachToken(newEmail());
        String forged = token.substring(0, token.length() - 4) + "AAAA";
        assertThat(call("GET", "/api/coach/profile", forged, null).status()).isEqualTo(401);
    }

    @Test
    void aFamilysTokenIsForbidden() throws Exception {
        String family = stub.token(newEmail(), List.of("Client"), "local-coach-app", Instant.now());
        Res r = call("GET", "/api/coach/profile", family, null);
        assertThat(r.status()).isEqualTo(403);
        assertThat(r.s("error")).isEqualTo("FORBIDDEN");
    }

    @Test
    void aTokenFromTheFamilyAppClientIsForbidden() throws Exception {
        String wrongClient = stub.token(newEmail(), List.of("Coach"), "local-family-app", Instant.now());
        assertThat(call("GET", "/api/coach/profile", wrongClient, null).status()).isEqualTo(403);
    }

    @Test
    void aSignInOlderThanSixtyMinutesMustSignInAgain() throws Exception {
        String old = stub.token(newEmail(), List.of("Coach"), "local-coach-app", Instant.now().minus(Duration.ofMinutes(61)));
        Res r = call("GET", "/api/coach/profile", old, null);
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.s("error")).isEqualTo("SIGN_IN_AGAIN");
    }

    // ---- sign-up step 3 ----

    @Test
    void beforeSignupTheProfileIsNotFound() throws Exception {
        Res r = call("GET", "/api/coach/profile", stub.coachToken(newEmail()), null);
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.s("error")).isEqualTo("NO_PROFILE");
    }

    @Test
    void signingUpWithTheLoginEmailMakesTheCodeWorkAtOnce() throws Exception {
        String email = newEmail();
        String token = stub.coachToken(email);

        Res r = call("POST", "/api/coach/signup", token, signup(true, null));

        assertThat(r.status()).isEqualTo(201);
        assertThat(r.s("loginEmail")).isEqualTo(email);
        assertThat(r.s("businessEmail")).isEqualTo(email);
        assertThat(r.body().get("codeWorks").asBoolean()).isTrue();
        assertThat(r.s("coachCode")).matches("[A-Z2-9]{4}-[A-Z2-9]{4}");
        assertThat(r.s("initials")).isEqualTo("DW");
        assertThat(r.body().get("requiredNoticeHours").asInt()).isEqualTo(24);
        assertThat(r.body().get("paymentTypes").toString()).contains("\"VENMO\"", "@dana");
        assertThat(call("GET", "/api/coach/profile", token, null).body()).isEqualTo(r.body());
    }

    @Test
    void signingUpWithADifferentEmailLeavesTheCodeNotWorkingUntilConfirmed() throws Exception {
        String token = stub.coachToken(newEmail());

        Res r = call("POST", "/api/coach/signup", token, signup(false, "lessons@dana.example.com"));
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.s("businessEmail")).isNull();
        assertThat(r.s("pendingBusinessEmail")).isEqualTo("lessons@dana.example.com");
        assertThat(r.body().get("codeWorks").asBoolean()).isFalse();

        Res confirmed = call("POST", "/api/coach/local/business-email/confirm", token, null);
        assertThat(confirmed.status()).isEqualTo(200);
        assertThat(confirmed.s("businessEmail")).isEqualTo("lessons@dana.example.com");
        assertThat(confirmed.body().get("codeWorks").asBoolean()).isTrue();
    }

    @Test
    void useMyLoginEmailInsteadMakesTheCodeWork() throws Exception {
        String email = newEmail();
        String token = stub.coachToken(email);
        call("POST", "/api/coach/signup", token, signup(false, "lessons@dana.example.com"));

        Res r = call("POST", "/api/coach/profile/business-email/use-login", token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("businessEmail")).isEqualTo(email);
        assertThat(r.body().get("codeWorks").asBoolean()).isTrue();
        assertThat(call("POST", "/api/coach/profile/business-email/use-login", token, null).status()).isEqualTo(409);
    }

    @Test
    void signingUpTwiceIsAConflict() throws Exception {
        String token = stub.coachToken(newEmail());
        call("POST", "/api/coach/signup", token, signup(true, null));
        Res r = call("POST", "/api/coach/signup", token, signup(true, null));
        assertThat(r.status()).isEqualTo(409);
    }

    @Test
    void aBadFieldIsNamedInTheError() throws Exception {
        String token = stub.coachToken(newEmail());
        Res r = call("POST", "/api/coach/signup", token, signup(true, null).replace("America/Chicago", "Mars/Base"));
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("error")).isEqualTo("INVALID");
        assertThat(r.s("field")).isEqualTo("coachTimezone");
    }

    @Test
    void anUnreadableBodyIsABadRequest() throws Exception {
        String token = stub.coachToken(newEmail());
        assertThat(call("POST", "/api/coach/signup", token, "{not json").status()).isEqualTo(400);
        assertThat(call("POST", "/api/coach/signup", token,
                signup(true, null).replace("\"CASH\"", "\"BITCOIN\"")).status()).isEqualTo(400);
    }

    // ---- profile ----

    @Test
    void detailsCanBeChangedButNotTheCurrency() throws Exception {
        String token = stub.coachToken(newEmail());
        call("POST", "/api/coach/signup", token, signup(true, null));

        Res r = call("PUT", "/api/coach/profile/details", token,
                "{\"firstName\":\"Danielle\",\"lastName\":\"Whitfield\",\"phone\":\"\",\"coachTimezone\":\"America/Toronto\",\"currency\":\"CAD\"}");

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("firstName")).isEqualTo("Danielle");
        assertThat(r.s("initials")).isEqualTo("DW");
        assertThat(r.s("phone")).isNull();
        assertThat(r.s("coachTimezone")).isEqualTo("America/Toronto");
        assertThat(r.s("currency")).isEqualTo("USD");
    }

    @Test
    void aPaymentTypeNeedsItsHandle() throws Exception {
        String token = stub.coachToken(newEmail());
        call("POST", "/api/coach/signup", token, signup(true, null));

        Res r = call("PUT", "/api/coach/profile/payments", token,
                "{\"paymentInstructions\":null,\"paymentTypes\":[{\"type\":\"PAYPAL\",\"on\":true,\"handle\":\"\"}]}");

        assertThat(r.status()).isEqualTo(400);
        assertThat(r.s("field")).isEqualTo("paypalHandle");
    }

    @Test
    void switchingATypeOffKeepsItsHandle() throws Exception {
        String token = stub.coachToken(newEmail());
        call("POST", "/api/coach/signup", token, signup(true, null));

        Res r = call("PUT", "/api/coach/profile/payments", token,
                "{\"paymentInstructions\":\"Cash only now.\",\"paymentTypes\":[{\"type\":\"CASH\",\"on\":true},{\"type\":\"VENMO\",\"on\":false,\"handle\":\"@dana\"}]}");

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("paymentInstructions")).isEqualTo("Cash only now.");
        JsonNode venmo = r.body().get("paymentTypes").get(2);
        assertThat(venmo.get("type").asString()).isEqualTo("VENMO");
        assertThat(venmo.get("on").asBoolean()).isFalse();
        assertThat(venmo.get("handle").asString()).isEqualTo("@dana");
    }

    @Test
    void visibilitySwitchesStartOffAndAreSaved() throws Exception {
        String token = stub.coachToken(newEmail());
        Res start = call("POST", "/api/coach/signup", token, signup(true, null));
        assertThat(start.body().get("showPhone").asBoolean()).isFalse();
        assertThat(start.body().get("showEmail").asBoolean()).isFalse();

        Res r = call("PUT", "/api/coach/profile/visibility", token, "{\"showPhone\":true,\"showEmail\":true}");

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("showPhone").asBoolean()).isTrue();
        assertThat(call("GET", "/api/coach/profile", token, null).body().get("showEmail").asBoolean()).isTrue();
    }

    @Test
    void rotatingGivesANewCode() throws Exception {
        String token = stub.coachToken(newEmail());
        String before = call("POST", "/api/coach/signup", token, signup(true, null)).s("coachCode");

        Res r = call("POST", "/api/coach/profile/code/rotate", token, null);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.s("coachCode")).isNotEqualTo(before);
    }

    @Test
    void eachCoachSeesOnlyTheirOwnProfile() throws Exception {
        String dana = stub.coachToken(newEmail());
        String sam = stub.coachToken(newEmail());
        call("POST", "/api/coach/signup", dana, signup(true, null));

        assertThat(call("GET", "/api/coach/profile", sam, null).status()).isEqualTo(404);
    }

    @Test
    void anUnknownRouteIsNotFoundNotAServerError() throws Exception {
        assertThat(call("GET", "/api/coach/nothing-here", stub.coachToken(newEmail()), null).status()).isEqualTo(404);
    }
}
