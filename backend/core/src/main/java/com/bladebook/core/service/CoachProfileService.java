package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.CoachRepository.CodeTakenException;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.PaymentTypes.Type;
import com.bladebook.core.domain.ProfileRules;

import java.security.SecureRandom;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;

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

    private final CoachRepository repo;
    private final Supplier<CoachCode> codes;

    /** @param codes where new codes come from; {@link #randomCodes()} outside tests */
    public CoachProfileService(CoachRepository repo, Supplier<CoachCode> codes) {
        this.repo = repo;
        this.codes = codes;
    }

    public static Supplier<CoachCode> randomCodes() {
        SecureRandom random = new SecureRandom();
        return () -> CoachCode.generate(random);
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

        CoachProfile.Builder b = CoachProfile.builder()
                .coachId(ctx.coachId())
                .firstName(ProfileRules.name("firstName", d.firstName))
                .lastName(ProfileRules.name("lastName", d.lastName))
                .loginEmail(login)
                .businessEmail(useLogin ? login : null)
                .pendingBusinessEmail(pending)
                .phone(ProfileRules.phone(d.phone))
                .coachTimezone(ProfileRules.timezone(d.coachTimezone))
                .currency(ProfileRules.currency(d.currency))
                .paymentInstructions(ProfileRules.instructions(d.payments.instructions))
                .payments(PaymentTypes.of(d.payments.switchedOn, d.payments.handles));

        return withFreshCode(code -> {
            CoachProfile p = b.coachCode(code).build();
            repo.create(ctx, p);
            return p;
        }, null);
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

    /** "Use my login email instead": the code works at once. Only while no business email is confirmed. */
    public CoachProfile useLoginEmail(AccessContext ctx) {
        CoachProfile current = profile(ctx);
        return activate(ctx, current, current.loginEmail());
    }

    /**
     * Confirms the address waiting for its link. <b>Local stand-in only</b> until BladeBook's
     * confirmation email and link page are built (implementation plan, batch 14).
     */
    public CoachProfile confirmPendingBusinessEmail(AccessContext ctx) {
        CoachProfile current = profile(ctx);
        if (current.pendingBusinessEmail() == null) {
            throw DomainException.conflict("There's no business email waiting to be confirmed.");
        }
        return activate(ctx, current, current.pendingBusinessEmail());
    }

    private CoachProfile activate(AccessContext ctx, CoachProfile current, String address) {
        if (current.codeWorks()) {
            throw DomainException.conflict("Your business email is already confirmed.");
        }
        // First try the code the coach has already seen; only a clash gives them a new one.
        try {
            repo.activateBusinessEmail(ctx, current, address, current.coachCode());
            return activated(current, address, current.coachCode());
        } catch (CodeTakenException taken) {
            return withFreshCode(code -> {
                repo.activateBusinessEmail(ctx, current, address, code);
                return activated(current, address, code);
            }, current.coachCode());
        }
    }

    private static CoachProfile activated(CoachProfile current, String address, CoachCode code) {
        return current.toBuilder().businessEmail(address).pendingBusinessEmail(null).coachCode(code).build();
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
