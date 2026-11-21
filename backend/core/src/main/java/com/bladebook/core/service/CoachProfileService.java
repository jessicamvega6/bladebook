package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.CoachRepository.CodeTakenException;
import com.bladebook.core.domain.BusinessEmails;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.Email;
import com.bladebook.core.domain.EmailFormat;
import com.bladebook.core.domain.LinkToken;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.PaymentTypes.Type;
import com.bladebook.core.domain.ProfileRules;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Coach sign-up's business-details step and the coach's own profile (ADR-016, ADR-MASTER section 4).
 * Every method acts only for the coach in the {@link AccessContext}.
 */
public final class CoachProfileService {

    /** How many codes to try before giving up. With 28^8 codes, a second try is already rare. */
    static final int CODE_ATTEMPTS = 5;

    /** Sign-up step 3, "How families reach you". */
    public static final class BusinessDetails {
        final String firstName;
        final String lastName;
        final boolean useLoginEmail;
        final String businessEmail;
        final String phone;
        final String coachTimezone;
        final String currency;
        final Payments payments;

        public BusinessDetails(String firstName, String lastName, boolean useLoginEmail, String businessEmail,
                               String phone, String coachTimezone, String currency, Payments payments) {
            this.firstName = firstName;
            this.lastName = lastName;
            this.useLoginEmail = useLoginEmail;
            this.businessEmail = businessEmail;
            this.phone = phone;
            this.coachTimezone = coachTimezone;
            this.currency = currency;
            this.payments = Objects.requireNonNull(payments, "payments");
        }
    }

    /** Profile → Details. Currency isn't here: it can't change in MVP. */
    public static final class Details {
        final String firstName;
        final String lastName;
        final String phone;
        final String coachTimezone;

        public Details(String firstName, String lastName, String phone, String coachTimezone) {
            this.firstName = firstName;
            this.lastName = lastName;
            this.phone = phone;
            this.coachTimezone = coachTimezone;
        }
    }

    /** Profile → Payments, and the payment part of sign-up: the whole state, as the form holds it. */
    public static final class Payments {
        final String instructions;
        final Set<Type> switchedOn;
        final Map<Type, String> handles;

        public Payments(String instructions, Set<Type> switchedOn, Map<Type, String> handles) {
            this.instructions = instructions;
            this.switchedOn = Set.copyOf(switchedOn);
            this.handles = Map.copyOf(handles);
        }
    }

    /**
     * How the business-email confirmation link is sent (ADR-016, amended 2026-11-12): straight from {@code api-coach}
     * through the {@link Mailer}, as the SES template {@code business-email-confirmation}.
     *
     * @param site   the coach website's address (production {@code https://app.bladebook.org}; I14); the link is
     *               {@code <site>/#/confirm-email/<token>}
     * @param tokens where new link tokens come from; {@link #randomTokens()} outside tests
     */
    public record ConfirmationMail(Mailer mailer, String site, Clock clock, Supplier<String> tokens) {

        public ConfirmationMail {
            site = site.endsWith("/") ? site.substring(0, site.length() - 1) : site;
        }

        String link(String token) {
            return site + "/#/confirm-email/" + token;
        }
    }

    /** A confirmed link: which address it was for, and the profile after. */
    public record Confirmed(String address, CoachProfile profile) {
    }

    private static final Logger LOG = Logger.getLogger(CoachProfileService.class.getName());

    private final CoachRepository repo;
    private final Supplier<CoachCode> codes;
    private final ConfirmationMail mail;

    /** @param codes where new codes come from; {@link #randomCodes()} outside tests */
    public CoachProfileService(CoachRepository repo, Supplier<CoachCode> codes, ConfirmationMail mail) {
        this.repo = repo;
        this.codes = codes;
        this.mail = mail;
    }

    public static Supplier<CoachCode> randomCodes() {
        SecureRandom random = new SecureRandom();
        return () -> CoachCode.generate(random);
    }

    public static Supplier<String> randomTokens() {
        SecureRandom random = new SecureRandom();
        return () -> LinkToken.random(random);
    }

    // ------------------------------------------------------------------ reads

    /** @throws DomainException NOT_FOUND if sign-up isn't finished; the website then shows step 3 */
    public CoachProfile profile(AccessContext ctx) {
        return repo.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first."));
    }

    // ---------------------------------------------------------------- sign-up

    /**
     * Writes the profile. With the login email (chosen, or typed as the "different" one) the code
     * works at once. With a different address the code waits for that address's link; the login
     * email is not a fallback (ADR-016, amended 2026-11-06).
     *
     * @param loginEmail from the verified token, never the request body
     */
    public CoachProfile completeSignup(AccessContext ctx, String loginEmail, BusinessDetails d) {
        String login = ProfileRules.email("loginEmail", loginEmail);
        boolean useLogin = d.useLoginEmail || ProfileRules.sameAddress(d.businessEmail, login);
        String pending = useLogin ? null : ProfileRules.email("businessEmail", d.businessEmail);
        String token = pending == null ? null : mail.tokens().get();

        CoachProfile.Builder b = CoachProfile.builder()
                .coachId(ctx.coachId())
                .firstName(ProfileRules.name("firstName", d.firstName))
                .lastName(ProfileRules.name("lastName", d.lastName))
                .loginEmail(login)
                .businessEmail(useLogin ? login : null)
                .pendingBusinessEmails(pending == null ? Map.of()
                        : Map.of(pending, BusinessEmails.Link.sentAt(LinkToken.hash(token), mail.clock().instant())))
                .phone(ProfileRules.phone(d.phone))
                .coachTimezone(ProfileRules.timezone(d.coachTimezone))
                .currency(ProfileRules.currency(d.currency))
                .paymentInstructions(ProfileRules.instructions(d.payments.instructions))
                .payments(PaymentTypes.of(d.payments.switchedOn, d.payments.handles));

        CoachProfile created = withFreshCode(code -> {
            CoachProfile p = b.coachCode(code).build();
            repo.create(ctx, p);
            return p;
        }, null);
        if (pending != null) {
            sendLink(created, pending, token);
        }
        return created;
    }

    // ---------------------------------------------------------------- profile

    public CoachProfile updateDetails(AccessContext ctx, Details d) {
        CoachProfile current = profile(ctx);
        CoachProfile next = current.toBuilder()
                .firstName(ProfileRules.name("firstName", d.firstName))
                .lastName(ProfileRules.name("lastName", d.lastName))
                .phone(ProfileRules.phone(d.phone))
                .coachTimezone(ProfileRules.timezone(d.coachTimezone))
                .build();
        repo.updateDetails(ctx, next);
        return next;
    }

    public CoachProfile updatePayments(AccessContext ctx, Payments p) {
        String instructions = ProfileRules.instructions(p.instructions);
        PaymentTypes payments = PaymentTypes.of(p.switchedOn, p.handles);
        CoachProfile current = profile(ctx);
        repo.updatePayments(ctx, instructions, payments);
        return current.toBuilder().paymentInstructions(instructions).payments(payments).build();
    }

    /**
     * What approved families see (Profile → Visibility & texts; ADR-MASTER section 4): the phone and the business email,
     * each the coach's choice. A waiting family never sees either, whatever these say (FamilyRepository.coachProfile).
     */
    public CoachProfile updateVisibility(AccessContext ctx, boolean showPhone, boolean showEmail) {
        CoachProfile current = profile(ctx);
        if (showPhone && current.phone() == null) {
            throw DomainException.invalid("showPhone", "Add your phone number under Details first.");
        }
        if (showEmail && current.businessEmail() == null) {
            throw DomainException.invalid("showEmail", "Your business email isn’t confirmed yet. Use the link we emailed you first.");
        }
        repo.updateVisibility(ctx, showPhone, showEmail);
        return current.toBuilder().displayPhoneToClients(showPhone).displayEmailToClients(showEmail).build();
    }

    /** A new code. A working code's old {@code CODE#} item is deleted at once. */
    public CoachProfile rotateCode(AccessContext ctx) {
        CoachProfile current = profile(ctx);
        return withFreshCode(code -> {
            repo.replaceCode(ctx, current, code);
            return current.toBuilder().coachCode(code).build();
        }, current.coachCode());
    }

    // --------------------------------------------------------- business email

    /**
     * "Use a new address" on Profile → Business email, or "Change address" at sign-up step 4 ({@code replaces}: the
     * waiting address it takes the place of, whose link stops working). The address waits for its link; families keep
     * the current one until it's confirmed (ADR-016, amended 2026-10-13).
     */
    public CoachProfile addBusinessEmail(AccessContext ctx, String address, String replaces) {
        String a = ProfileRules.email("address", address);
        CoachProfile current = profile(ctx);
        BusinessEmails list = current.businessEmails();
        if (replaces != null && !replaces.isBlank() && list.pending().keySet().stream().anyMatch(k -> ProfileRules.sameAddress(k, replaces))) {
            list = list.remove(replaces);
        }
        String token = mail.tokens().get();
        CoachProfile next = save(ctx, current, list.add(a, BusinessEmails.Link.sentAt(LinkToken.hash(token), mail.clock().instant())));
        sendLink(next, a, token);
        return next;
    }

    /** "Resend link": a new link for a waiting address; the one sent before stops working. */
    public CoachProfile resendBusinessEmailLink(AccessContext ctx, String address) {
        CoachProfile current = profile(ctx);
        String token = mail.tokens().get();
        Instant now = mail.clock().instant();
        BusinessEmails next = current.businessEmails().resend(address, BusinessEmails.Link.sentAt(LinkToken.hash(token), now), now);
        CoachProfile saved = save(ctx, current, next);
        String key = next.pending().keySet().stream().filter(k -> ProfileRules.sameAddress(k, address)).findFirst().orElseThrow();
        sendLink(saved, key, token);
        return saved;
    }

    /** Takes an address off the list: any but the current one and the login email. A waiting address's link dies with it. */
    public CoachProfile removeBusinessEmail(AccessContext ctx, String address) {
        CoachProfile current = profile(ctx);
        return save(ctx, current, current.businessEmails().remove(address));
    }

    /** Profile → Business email's Save: a confirmed address, or the login email, becomes the business email. */
    public CoachProfile chooseBusinessEmail(AccessContext ctx, String address) {
        CoachProfile current = profile(ctx);
        BusinessEmails next = current.businessEmails().choose(address);
        return ProfileRules.sameAddress(next.current(), current.businessEmail()) ? current : save(ctx, current, next);
    }

    /** "Use my login email instead": the code works at once. Only while no business email is confirmed. */
    public CoachProfile useLoginEmail(AccessContext ctx) {
        CoachProfile current = profile(ctx);
        if (current.codeWorks()) {
            throw DomainException.conflict("Your business email is already confirmed.");
        }
        return save(ctx, current, current.businessEmails().choose(current.loginEmail()));
    }

    /**
     * The confirm page, before the coach chooses Confirm: which address the link is for. Changes nothing, so a mail
     * scanner that opens the link confirms nothing (ADR-016, amended 2026-10-13).
     *
     * @throws DomainException CONFLICT ({@link BusinessEmails#LINK_DOESNT_WORK}) if the link is used, replaced, expired or
     *                         not this coach's
     */
    public String checkBusinessEmailLink(AccessContext ctx, String token) {
        String hash = LinkToken.hashOrNull(token);
        return profile(ctx).businessEmails().find(hash, mail.clock().instant())
                .orElseThrow(() -> DomainException.conflict(BusinessEmails.LINK_DOESNT_WORK));
    }

    /**
     * The coach, signed in, chose Confirm: the link's address becomes the business email and the link is used up. A new
     * coach's code starts working ({@code CODE#} is written in the same transaction). Checked against the signed-in coach's
     * own profile only, so another coach's link matches nothing (ADR-016, amended 2026-11-12).
     */
    public Confirmed confirmBusinessEmail(AccessContext ctx, String token) {
        String hash = LinkToken.hashOrNull(token);
        CoachProfile current = profile(ctx);
        Instant now = mail.clock().instant();
        String address = current.businessEmails().find(hash, now)
                .orElseThrow(() -> DomainException.conflict(BusinessEmails.LINK_DOESNT_WORK));
        return new Confirmed(address, save(ctx, current, current.businessEmails().confirm(hash, now)));
    }

    /**
     * Writes the list with the next version. If it gives a new coach a confirmed address, the code starts working: first
     * the code the coach has already seen; only a clash gives them a new one.
     */
    private CoachProfile save(AccessContext ctx, CoachProfile current, BusinessEmails list) {
        CoachProfile.Builder b = current.toBuilder().businessEmails(list).businessEmailsVersion(current.businessEmailsVersion() + 1);
        try {
            CoachProfile next = b.build();
            repo.saveBusinessEmails(ctx, current, next);
            return next;
        } catch (CodeTakenException taken) {
            return withFreshCode(code -> {
                CoachProfile next = b.coachCode(code).build();
                repo.saveBusinessEmails(ctx, current, next);
                return next;
            }, current.coachCode());
        }
    }

    /**
     * The confirmation email, to the new address, from BladeBook with no Reply-To (design/harbor/email/templates.mjs,
     * {@code business-email-confirmation}). The address and its link are already saved, so a refused email is reported and
     * the coach can use Resend.
     */
    private void sendLink(CoachProfile coach, String address, String token) {
        BusinessEmails.Link link = coach.pendingBusinessEmails().get(address);
        Map<String, Object> data = new HashMap<>();
        data.put("coachFirst", coach.firstName());
        data.put("newEmail", address);
        data.put("confirmUrl", mail.link(token));
        data.put("expiresAt", EmailFormat.dateTime(link.expiresAt(), coach.coachTimezone()));
        try {
            mail.mailer().send(new Email("business-email-confirmation", address, "BladeBook", null, data));
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "email not accepted: business-email-confirmation", e);
            throw DomainException.conflict("We saved the address but couldn’t send its email. Try Resend link in a minute.");
        }
    }

    /** Runs {@code write} with new codes until one isn't taken, up to {@link #CODE_ATTEMPTS}. */
    private CoachProfile withFreshCode(Function<CoachCode, CoachProfile> write, CoachCode avoid) {
        for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            CoachCode code = codes.get();
            if (code.equals(avoid)) {
                continue;
            }
            try {
                return write.apply(code);
            } catch (CodeTakenException taken) {
                // try another
            }
        }
        throw new IllegalStateException("no free coach code after " + CODE_ATTEMPTS + " attempts");
    }
}
