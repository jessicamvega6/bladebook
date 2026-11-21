package com.bladebook.core.domain;

import java.util.Map;
import java.util.Objects;

/**
 * One email, as SES sends it from a stored template (design/harbor/email/ses): the template's name, who it's to, the
 * sender's display name, the Reply-To, and the template data, already formatted ({@link EmailFormat}).
 *
 * <p>Family emails come from {@code "<coach> via BladeBook"} with Reply-To the coach's business email (ADR-016 d8;
 * ADR-MASTER section 13). Coach emails come from {@code "BladeBook"}, go to the coach's login email, and have no Reply-To
 * ({@code replyTo} is {@code null}: SES sends no-reply). SES escapes every {@code {{value}}} in the HTML, so the data
 * isn't escaped here, which would show {@code &amp;amp;} in the email.
 */
public record Email(String template, String to, String fromName, String replyTo, Map<String, Object> data) {

    public Email {
        Objects.requireNonNull(template, "template");
        Objects.requireNonNull(to, "to");
        Objects.requireNonNull(fromName, "fromName");
        data = Map.copyOf(data);
    }

    /** To a family, from the coach, replies going to the coach's business email (or the login email it stands for). */
    public static Email toFamily(String template, String to, CoachProfile coach, Map<String, Object> data) {
        String replyTo = coach.businessEmail() != null ? coach.businessEmail() : coach.loginEmail();
        return new Email(template, to, coach.firstName() + " " + coach.lastName() + " via BladeBook", replyTo, data);
    }

    /** To the coach's login email, from BladeBook (ADR-MASTER section 13). */
    public static Email toCoach(String template, CoachProfile coach, Map<String, Object> data) {
        return new Email(template, coach.loginEmail(), "BladeBook", null, data);
    }
}
