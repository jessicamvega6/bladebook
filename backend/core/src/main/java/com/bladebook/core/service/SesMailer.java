package com.bladebook.core.service;

import com.bladebook.core.domain.Email;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.Destination;
import software.amazon.awssdk.services.sesv2.model.EmailContent;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sesv2.model.Template;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

/**
 * Sends one email with SES's {@code SendEmail} and a stored template (design/harbor/email/ses; ADR-MASTER section 13).
 *
 * <p>Every email comes from the environment's one sending address, under the {@link Email}'s display name: a family's
 * from {@code "<coach> via BladeBook"}, a coach's from {@code "BladeBook"}. Replies go to the {@link Email}'s Reply-To, or
 * to the no-reply address when it has none (emails to the coach). Throws SES's exception if the email isn't accepted;
 * the caller decides whether that is retried ({@code MessageRejected} isn't, 2026-11-17).
 */
public final class SesMailer implements Mailer {

    /** The environment's sending addresses (ADR-MASTER section 13: settings per environment). */
    public record Senders(String from, String noReply) {

        public Senders {
            requireAddress(from, "from");
            requireAddress(noReply, "noReply");
        }

        private static void requireAddress(String a, String name) {
            if (a == null || !a.matches("[^@\\s<>\"]+@[^@\\s<>\"]+")) {
                throw new IllegalArgumentException("The " + name + " address isn't set: " + a);
            }
        }
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final SesV2Client ses;
    private final Senders senders;

    public SesMailer(SesV2Client ses, Senders senders) {
        this.ses = Objects.requireNonNull(ses, "ses");
        this.senders = Objects.requireNonNull(senders, "senders");
    }

    /** On AWS: the region and the function's own credentials come from the Lambda environment. */
    public static SesMailer aws(Senders senders) {
        return new SesMailer(SesV2Client.builder()
                .region(new DefaultAwsRegionProviderChain().getRegion())
                .httpClient(UrlConnectionHttpClient.create())
                .build(), senders);
    }

    @Override
    public void send(Email email) {
        ses.sendEmail(request(email));
    }

    SendEmailRequest request(Email email) {
        return SendEmailRequest.builder()
                .fromEmailAddress(mailbox(email.fromName(), senders.from()))
                .destination(Destination.builder().toAddresses(email.to()).build())
                .replyToAddresses(email.replyTo() != null ? email.replyTo() : senders.noReply())
                .content(EmailContent.builder().template(Template.builder()
                        .templateName(email.template())
                        .templateData(JSON.writeValueAsString(email.data()))
                        .build()).build())
                .build();
    }

    /**
     * {@code "Name" <address>}. A name in plain ASCII is quoted with its quotes and backslashes escaped; any other name is
     * encoded (RFC 2047, UTF-8, base64), so a coach's name can't change the header or the address.
     */
    static String mailbox(String name, String address) {
        String clean = name.replaceAll("[\\r\\n\\t]+", " ").strip();
        if (clean.chars().allMatch(c -> c >= 0x20 && c < 0x7f)) {
            return "\"" + clean.replace("\\", "\\\\").replace("\"", "\\\"") + "\" <" + address + ">";
        }
        return "=?UTF-8?B?" + Base64.getEncoder().encodeToString(clean.getBytes(StandardCharsets.UTF_8)) + "?= <" + address + ">";
    }
}
