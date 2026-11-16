package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The sending port: anything that takes an {@link Email}; SES on AWS, the outbox locally. */
class MailerTest {

    @Test
    void aMailerIsJustSend() {
        List<String> sent = new ArrayList<>();
        Mailer m = e -> sent.add(e.template());
        m.send(new Email("coach-morning", "dana@example.com", "BladeBook", null, Map.of()));
        assertThat(sent).containsExactly("coach-morning");
    }
}
