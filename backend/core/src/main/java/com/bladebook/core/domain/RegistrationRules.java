package com.bladebook.core.domain;

import com.bladebook.core.domain.RegistrationRequest.SkaterRequest;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Checks a family's sign-up (ADR-MASTER section 5, "Registration"; FeatureDecriptions/Client Sign Up).
 *
 * <ul>
 *   <li>1 to 10 coach codes (ADR-025, 2026-10-07); the same code typed twice counts once.</li>
 *   <li>{@code SELF}: exactly one skater, the account holder, an adult, named from the account.</li>
 *   <li>{@code GUARDIAN}: 1 to 10 skaters, every one a minor (A7).</li>
 *   <li>Each skater picks at least one of the sign-up's coaches, and gives a registration number.</li>
 *   <li>The whole sign-up is one transaction, so it can't write more than 100 items.</li>
 * </ul>
 * Checks run in form order and stop at the first problem.
 */
public final class RegistrationRules {

    public static final int MAX_COACHES = 10;
    public static final int MAX_SKATERS = 10;
    static final int MAX_SKATER_NAME = 80;
    static final int MAX_ITEMS = 100;

    static final String NO_SUCH_COACH = "That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.";

    private final RegistrationNumbers numbers;

    public RegistrationRules(RegistrationNumbers numbers) {
        this.numbers = numbers;
    }

    public Registration check(RegistrationRequest req) {
        ClientRelationship rel = ClientRelationship.parse(req.relationship());
        String first = ProfileRules.name("firstName", req.firstName());
        String last = ProfileRules.name("lastName", req.lastName());
        String phone = ProfileRules.phone(req.phone());
        if (phone == null) {
            throw DomainException.invalid("phone", "Enter a mobile phone number.");
        }
        List<CoachCode> codes = codes(req.coachCodes());

        List<SkaterRequest> asked = req.skaters() == null ? List.of() : req.skaters();
        if (rel == ClientRelationship.SELF && asked.size() != 1) {
            throw DomainException.invalid("skaters", "When you skate yourself, you’re the only skater on the account.");
        }
        if (asked.isEmpty()) {
            throw DomainException.invalid("skaters", "Add at least one skater.");
        }
        if (asked.size() > MAX_SKATERS) {
            throw DomainException.invalid("skaters", "Add up to " + MAX_SKATERS + " skaters now. You can add more later.");
        }

        List<NewSkater> skaters = new ArrayList<>();
        int links = 0;
        for (int i = 0; i < asked.size(); i++) {
            SkaterRequest s = asked.get(i);
            String name = rel == ClientRelationship.SELF ? first + " " + last : skaterName(i, s.name());
            SkatingOrg org = SkatingOrg.parse(s.skatingOrg());
            String number;
            try {
                number = numbers.clean(org, s.registrationNumber());
            } catch (DomainException e) {
                throw DomainException.invalid("skaters." + i + "." + e.field(), e.getMessage());
            }
            List<CoachCode> joins = skaterCoaches(i, name, s.coachCodes(), codes);
            links += joins.size();
            skaters.add(new NewSkater(name, rel == ClientRelationship.GUARDIAN, org, number, joins));
        }
        if (itemCount(skaters.size(), links) > MAX_ITEMS) {
            throw DomainException.invalid("skaters",
                    "That’s more than one sign-up can send. Send fewer skaters or coaches now; you can add the rest later.");
        }
        return new Registration(first, last, phone, rel, codes, skaters);
    }

    /** One profile, one {@code SKATER#} per skater, and a link and a {@code STUDENT#} per skater per coach. */
    static int itemCount(int skaters, int skaterCoachPairs) {
        return 1 + skaters + 2 * skaterCoachPairs;
    }

    private static List<CoachCode> codes(List<String> typed) {
        Set<CoachCode> codes = new LinkedHashSet<>();
        for (String t : typed == null ? List.<String>of() : typed) {
            codes.add(code(t));
        }
        if (codes.isEmpty()) {
            throw DomainException.invalid("coachCodes", "Enter your coach’s code.");
        }
        if (codes.size() > MAX_COACHES) {
            throw DomainException.invalid("coachCodes", "Sign up with up to " + MAX_COACHES + " coaches. You can add more later.");
        }
        return new ArrayList<>(codes);
    }

    /** A code that can't be a coach code matches no coach: the same answer as an unknown one. */
    static CoachCode code(String typed) {
        try {
            return CoachCode.parse(typed);
        } catch (DomainException e) {
            throw DomainException.invalid("coachCodes", NO_SUCH_COACH);
        }
    }

    private static String skaterName(int i, String typed) {
        String v = typed == null ? "" : typed.trim();
        String field = "skaters." + i + ".name";
        if (v.isEmpty()) {
            throw DomainException.invalid(field, "Enter the skater’s full name.");
        }
        if (v.length() > MAX_SKATER_NAME) {
            throw DomainException.invalid(field, "Keep the name to " + MAX_SKATER_NAME + " characters.");
        }
        if (v.chars().anyMatch(Character::isISOControl)) {
            throw DomainException.invalid(field, "The name has a character it can't hold.");
        }
        return v;
    }

    private static List<CoachCode> skaterCoaches(int i, String name, List<String> typed, List<CoachCode> signUp) {
        Set<CoachCode> joins = new LinkedHashSet<>();
        for (String t : typed == null ? List.<String>of() : typed) {
            CoachCode c = code(t);
            if (!signUp.contains(c)) {
                throw DomainException.invalid("skaters." + i + ".coachCodes", "Pick coaches from the codes you entered.");
            }
            joins.add(c);
        }
        if (joins.isEmpty()) {
            throw DomainException.invalid("skaters." + i + ".coachCodes", "Pick at least one coach for " + name + ".");
        }
        return new ArrayList<>(joins);
    }
}
