package com.bladebook.core.service;

import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.NewSkater;
import com.bladebook.core.domain.Registration;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.RegistrationRules;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.SkatingOrg;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.service.FamilyService.FamilyView;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Family registration (ADR-MASTER section 5): check the sign-up, resolve every coach code again inside the
 * signed-in session, then write the profile, the skaters, and a link and a {@code PENDING} record per
 * skater per coach in one transaction. No coach ID from the browser is ever used.
 */
public final class RegistrationService {

    private final CodeRepository codes;
    private final FamilyRepository families;
    private final RegistrationRules rules;
    private final FamilyService view;
    private final Supplier<String> newStudentId;
    private final Clock clock;

    public RegistrationService(CodeRepository codes, FamilyRepository families, RegistrationRules rules,
                               FamilyService view, Supplier<String> newStudentId, Clock clock) {
        this.codes = codes;
        this.families = families;
        this.rules = rules;
        this.view = view;
        this.newStudentId = newStudentId;
        this.clock = clock;
    }

    /**
     * @param loginEmail the account's email, from the token
     * @throws DomainException INVALID for a bad field or an unknown code, CONFLICT if already signed up
     */
    public FamilyView register(ClientContext ctx, String loginEmail, RegistrationRequest request) {
        Registration r = rules.check(request);

        Map<CoachCode, CodeRepository.Found> coaches = new HashMap<>();
        for (CoachCode code : r.coachCodes()) {
            coaches.put(code, codes.resolve(ctx, code).orElseThrow(() ->
                    DomainException.invalid("coachCodes",
                            "That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.")));
        }

        Instant now = clock.instant();
        FamilyProfile profile = new FamilyProfile(ctx.clientId(), r.firstName(), r.lastName(), loginEmail, r.phone(),
                r.relationship(), now);
        List<Skater> skaters = new ArrayList<>();
        List<StudentRecord> students = new ArrayList<>();
        Map<String, CoachName> names = new HashMap<>();
        for (NewSkater s : r.skaters()) {
            Skater k = new Skater(newStudentId.get(), s.name(), s.isMinor(), s.skatingOrg(), s.registrationNumber());
            skaters.add(k);
            for (CoachCode code : s.coachCodes()) {
                CodeRepository.Found coach = coaches.get(code);
                names.put(coach.coachId(), coach.name());
                students.add(new StudentRecord(coach.coachId(), k.studentId(), ctx.clientId(), StudentStatus.PENDING,
                        k.name(), k.isMinor(), r.relationship(), profile.fullName(), loginEmail, r.phone(),
                        k.skatingOrg(), k.registrationNumber(), now));
            }
        }
        families.register(ctx, profile, skaters, students, names);
        return view.view(ctx);
    }

    // ------------------------------------------------ Profile: Add a skater and Add a coach (A9; ADR-025 d2, item k)

    /** Add a skater. {@code coachIds}: from the family's own coaches; {@code noCoach}: "None of my coaches yet". */
    public record AddSkater(String name, String skatingOrg, String registrationNumber, List<String> coachIds, boolean noCoach) {
    }

    /** At most this many skaters on one account (sign-up allows 10 at once; the rest are added here). */
    public static final int MAX_FAMILY_SKATERS = 20;
    static final String WRONG_CODE = "That code doesn’t match a coach. Check it with the coach who gave it to you. Codes are 8 letters and numbers.";

    /**
     * A new skater, under 18, waiting for each coach picked; or, with "None of my coaches yet", with no coach at all until
     * Add a coach. Coaches are the family's own, read from its links: a coach ID from the browser is only matched against them.
     */
    public FamilyView addSkater(ClientContext ctx, AddSkater req) {
        FamilyAccount a = account(ctx);
        FamilyProfile p = a.profile();
        if (p.relationship() == ClientRelationship.SELF) {
            throw DomainException.invalid("name", "You skate yourself. To book for a child, they need their own family account.");
        }
        String name = RegistrationRules.skaterName("name", req.name());
        a.skaters().stream().filter(k -> k.name().equalsIgnoreCase(name)).findFirst().ifPresent(k -> {
            throw DomainException.invalid("name", k.name() + " is already on your account.");
        });
        if (a.skaters().size() >= MAX_FAMILY_SKATERS) {
            throw DomainException.invalid("name", "An account can have up to " + MAX_FAMILY_SKATERS + " skaters.");
        }
        SkatingOrg org = SkatingOrg.parse(req.skatingOrg());
        String number = rules.number(org, req.registrationNumber());
        List<String> picked = req.coachIds() == null ? List.of() : req.coachIds().stream().distinct().toList();
        if (req.noCoach() && !picked.isEmpty()) {
            throw DomainException.invalid("coachIds", "Pick coaches or “None of my coaches yet”, not both.");
        }
        if (!req.noCoach() && picked.isEmpty()) {
            throw DomainException.invalid("coachIds", "Pick each coach " + name + " will take lessons with, or “None of my coaches yet”.");
        }
        // Only coaches who've approved one of the family's skaters: a waiting family is never given a coach's ID
        // (ADR-MASTER section 16), so any other ID is refused, not trusted. A waiting coach is reached through Add a coach.
        Map<String, CoachName> mine = new HashMap<>();
        a.links().stream().filter(l -> a.standing().statusWith(l.coachId()).orElse(null) == StudentStatus.ACTIVE)
                .forEach(l -> mine.put(l.coachId(), new CoachName(l.coachFirstName(), l.coachLastName())));
        if (!mine.keySet().containsAll(picked)) {
            throw DomainException.invalid("coachIds", "Pick from your approved coaches. For any other coach, use Add a coach.");
        }
        Instant now = clock.instant();
        Skater k = new Skater(newStudentId.get(), name, true, org, number);
        List<StudentRecord> records = picked.stream().map(coachId -> pending(coachId, k, p, now)).toList();
        families.addSkater(ctx, p.relationship(), k, records, mine);
        return view.view(ctx);
    }

    /**
     * Add a coach: the code is resolved here, and each chosen skater not already with that coach waits for them alone. The
     * family's other coaches aren't affected.
     */
    public FamilyView addCoach(ClientContext ctx, String code, List<String> studentIds) {
        FamilyAccount a = account(ctx);
        CodeRepository.Found coach;
        try {
            coach = codes.resolve(ctx, RegistrationRules.code(code)).orElseThrow();
        } catch (DomainException | java.util.NoSuchElementException e) {
            throw DomainException.invalid("coachCode", WRONG_CODE);
        }
        String first = coach.name().firstName();
        List<String> ids = studentIds == null ? List.of() : studentIds.stream().distinct().toList();
        if (ids.isEmpty()) {
            throw DomainException.invalid("studentIds", "Pick at least one skater for Coach " + first + ".");
        }
        Map<String, Skater> skaters = new HashMap<>();
        a.skaters().forEach(k -> skaters.put(k.studentId(), k));
        if (!skaters.keySet().containsAll(ids)) {
            throw DomainException.noSuchItem("That skater couldn’t be found.");
        }
        long coaches = a.links().stream().map(SkaterLink::coachId).filter(id -> !id.equals(coach.coachId())).distinct().count();
        if (coaches >= RegistrationRules.MAX_COACHES) {
            throw DomainException.invalid("coachCode", "An account can have up to " + RegistrationRules.MAX_COACHES + " coaches.");
        }
        Instant now = clock.instant();
        List<StudentRecord> records = ids.stream()
                .filter(id -> a.links().stream().noneMatch(l -> l.studentId().equals(id) && l.coachId().equals(coach.coachId())))
                .map(id -> pending(coach.coachId(), skaters.get(id), a.profile(), now)).toList();
        if (records.isEmpty()) {
            throw DomainException.invalid("studentIds", "Those skaters are already with Coach " + first + ".");
        }
        families.addCoach(ctx, records, Map.of(coach.coachId(), coach.name()));
        return view.view(ctx);
    }

    private FamilyAccount account(ClientContext ctx) {
        return families.account(ctx).orElseThrow(() -> DomainException.notFound("Finish signing up first."));
    }

    private static StudentRecord pending(String coachId, Skater k, FamilyProfile p, Instant now) {
        return new StudentRecord(coachId, k.studentId(), p.clientId(), StudentStatus.PENDING, k.name(), k.isMinor(), p.relationship(),
                p.fullName(), p.email(), p.phone(), k.skatingOrg(), k.registrationNumber(), now);
    }
}
