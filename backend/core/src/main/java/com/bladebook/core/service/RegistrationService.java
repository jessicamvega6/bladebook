package com.bladebook.core.service;

import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.NewSkater;
import com.bladebook.core.domain.Registration;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.RegistrationRules;
import com.bladebook.core.domain.Skater;
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
}
