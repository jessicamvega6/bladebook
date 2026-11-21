package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.RegistrationNumbers;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.RegistrationRequest.SkaterRequest;
import com.bladebook.core.domain.RegistrationRules;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** One table with every family-side service wired to it. */
final class FamilyTestSupport {

    static final Instant NOW = Instant.parse("2026-11-09T15:00:00Z");

    final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    final CoachRepository coaches = new CoachRepository(f.clients, f.table);
    final FamilyRepository families = new FamilyRepository(f.clients, f.table);
    final StudentRepository studentRepo = new StudentRepository(f.clients, f.table);
    final SyncRepository sync = new SyncRepository(f.clients, f.table);
    final FamilyService familyService = new FamilyService(families);
    final RegistrationService registration = new RegistrationService(new CodeRepository(f.clients, f.table), families,
            new RegistrationRules(RegistrationNumbers.withoutSeasonCheck()), familyService,
            () -> UUID.randomUUID().toString(), Clock.fixed(NOW, ZoneOffset.UTC));
    final StudentService students = new StudentService(studentRepo);
    final StudentLinkService links = new StudentLinkService(sync);
    final FamilySyncService familySync = new FamilySyncService(sync);

    /** A coach whose code works, with their phone shown to approved families. */
    AccessContext coach(String first, String code) {
        AccessContext ctx = new AccessContext(UUID.randomUUID().toString());
        coaches.create(ctx, CoachProfile.builder().coachId(ctx.coachId()).firstName(first).lastName("Whitfield")
                .loginEmail(first.toLowerCase() + "@gmail.com").businessEmail(first.toLowerCase() + "@gmail.com")
                .phone("(205) 555-0142").coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD)
                .coachCode(CoachCode.parse(code)).displayPhoneToClients(true)
                .payments(PaymentTypes.of(Set.of(PaymentTypes.Type.VENMO), Map.of(PaymentTypes.Type.VENMO, "@dana-skates")))
                .build());
        return ctx;
    }

    static ClientContext newFamily() {
        return new ClientContext(UUID.randomUUID().toString());
    }

    static SkaterRequest kid(String name, String... codes) {
        return new SkaterRequest(name, "USFS", "1234567", List.of(codes));
    }

    static RegistrationRequest guardian(List<String> codes, SkaterRequest... kids) {
        return new RegistrationRequest("Sarah", "Park", "(205) 555-0196", "GUARDIAN", codes, List.of(kids));
    }
}
