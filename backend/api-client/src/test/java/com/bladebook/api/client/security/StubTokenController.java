package com.bladebook.api.client.security;

import com.bladebook.core.domain.ProfileRules;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** <b>Test code only.</b> The seed generator's way to sign its people in (ruling I32): a client ID token for an email. */
@RestController
@Profile("stub-tokens")
public class StubTokenController {

    static final String PATH = "/api/client/local/token";

    public record TokenRequest(String loginEmail) {
    }

    private final TestTokenStub stub;

    public StubTokenController(TestTokenStub stub) {
        this.stub = stub;
    }

    @PostMapping(PATH)
    public Map<String, String> token(@RequestBody TokenRequest body) {
        return Map.of("idToken", stub.familyToken(ProfileRules.email("loginEmail", body.loginEmail())));
    }
}
