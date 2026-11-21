package com.bladebook.api.coach.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;

/** The seed generator's file of real Cognito {@code sub}s (Batch 17b, ADR-028 decision 4). */
class TestTokenStubTest {

    @TempDir
    Path dir;

    @Test
    void anEmailInTheSubsFileGetsItsSubAnyOtherGetsOneMadeFromTheEmail() throws Exception {
        Path subs = dir.resolve("subs.properties");
        Files.writeString(subs, "owner+dev-coach-a@mailbox.test=11111111-2222-3333-4444-555555555555\n");
        TestTokenStub stub = new TestTokenStub(Clock.systemUTC(), "app-client", subs.toString());

        assertThat(stub.subFor(" OWNER+dev-coach-a@Mailbox.test ")).isEqualTo("11111111-2222-3333-4444-555555555555");
        assertThat(stub.subFor("someone@example.test"))
                .isEqualTo(new TestTokenStub(Clock.systemUTC(), "app-client", "").subFor("Someone@Example.test"))
                .isNotEqualTo("11111111-2222-3333-4444-555555555555");
        assertThat(stub.localJwtDecoder().decode(stub.coachToken("Coach@Example.test")).getSubject()).isNotBlank();
    }
}
