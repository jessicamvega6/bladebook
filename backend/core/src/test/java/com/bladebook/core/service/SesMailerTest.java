package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SesMailerTest {

    private static final SesMailer.Senders SENDERS = new SesMailer.Senders("lessons@example.org", "no-reply@example.org");
    private final SesMailer mailer = new SesMailer(SesV2Client.builder().region(Region.US_EAST_1).build(), SENDERS);

    @Test
    void aFamilyEmailComesFromTheCoachViaBladeBookWithTheCoachAsReplyTo() {
        SendEmailRequest r = mailer.request(new Email("booking-confirmation", "fam@example.com", "Dana Lee via BladeBook",
                "dana@example.com", Map.of("coachFirst", "Dana")));
        assertEquals("\"Dana Lee via BladeBook\" <lessons@example.org>", r.fromEmailAddress());
        assertEquals(List.of("fam@example.com"), r.destination().toAddresses());
        assertEquals(List.of("dana@example.com"), r.replyToAddresses());
        assertEquals("booking-confirmation", r.content().template().templateName());
    }

    @Test
    void aCoachEmailHasTheNoReplyAddress() {
        SendEmailRequest r = mailer.request(new Email("coach-morning", "coach@example.com", "BladeBook", null, Map.of()));
        assertEquals("\"BladeBook\" <lessons@example.org>", r.fromEmailAddress());
        assertEquals(List.of("no-reply@example.org"), r.replyToAddresses());
    }

    @Test
    void theTemplateDataIsJsonWithListsAndValuesUnescaped() {
        Map<String, Object> data = Map.of("lessons", List.of(Map.of("time", "4:00 PM")), "note", "Tom & Jerry <3");
        SendEmailRequest r = mailer.request(new Email("t", "a@example.com", "BladeBook", null, data));
        assertEquals(data, JsonMapper.builder().build().readValue(r.content().template().templateData(), Map.class));
    }

    @Test
    void aNameCantBreakOutOfItsQuotes() {
        assertEquals("\"Al \\\"Ace\\\" O\\\\Neil via BladeBook\" <x@e.org>", SesMailer.mailbox("Al \"Ace\" O\\Neil via BladeBook", "x@e.org"));
        assertEquals("\"Evil Bcc: a@b.c via BladeBook\" <x@e.org>", SesMailer.mailbox("Evil\r\nBcc: a@b.c via BladeBook", "x@e.org"));
    }

    @Test
    void aNameOutsideAsciiIsEncoded() {
        String m = SesMailer.mailbox("Zoë Núñez via BladeBook", "x@e.org");
        String encoded = m.substring("=?UTF-8?B?".length(), m.indexOf("?= <"));
        assertEquals("Zoë Núñez via BladeBook", new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8));
        assertEquals(" <x@e.org>", m.substring(m.indexOf("?=") + 2));
    }

    @Test
    void theSendingAddressesMustBeSet() {
        assertThrows(IllegalArgumentException.class, () -> new SesMailer.Senders("", "no-reply@example.org"));
        assertThrows(IllegalArgumentException.class, () -> new SesMailer.Senders("lessons@example.org", null));
        assertThrows(IllegalArgumentException.class, () -> new SesMailer.Senders("a@b.c>, evil@x.y", "no-reply@example.org"));
    }
}
