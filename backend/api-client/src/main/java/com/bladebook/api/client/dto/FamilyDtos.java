package com.bladebook.api.client.dto;

import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.CoachPublicProfile;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.service.FamilyService;

import java.util.ArrayList;
import java.util.List;

/** What the family website sends and gets back. No coach or student IDs ever leave api-client. */
public final class FamilyDtos {

    private FamilyDtos() {
    }

    /** Step 1: the coach a code belongs to. Names only (ADR-022 d7; A6). Initials stand in for a photo (A1). */
    public record CoachLookupResponse(String firstName, String lastName, String initials) {
        public static CoachLookupResponse of(CoachName n) {
            return new CoachLookupResponse(n.firstName(), n.lastName(), n.initials());
        }
    }

    public record SkaterBody(String name, String skatingOrg, String registrationNumber, List<String> coachCodes) {
    }

    /** The whole sign-up. The login email comes from the token, not from here. */
    public record RegistrationBody(String firstName, String lastName, String phone, String relationship,
                                   List<String> coachCodes, List<SkaterBody> skaters) {
        public RegistrationRequest toRequest() {
            List<RegistrationRequest.SkaterRequest> ks = new ArrayList<>();
            for (SkaterBody s : skaters == null ? List.<SkaterBody>of() : skaters) {
                if (s != null) {
                    ks.add(new RegistrationRequest.SkaterRequest(s.name(), s.skatingOrg(), s.registrationNumber(), s.coachCodes()));
                }
            }
            return new RegistrationRequest(firstName, lastName, phone, relationship, coachCodes, ks);
        }
    }

    public record ContactBody(String firstName, String lastName, String phone) {
    }

    public record PaymentDto(PaymentTypes.Type type, String handle) {
    }

    /** An approved coach's contact details, as the coach chose to show them. */
    public record CoachDetailsDto(String phone, String email, List<PaymentDto> payments) {
        static CoachDetailsDto of(CoachPublicProfile p) {
            if (p == null) {
                return null;
            }
            List<PaymentDto> on = new ArrayList<>();
            for (PaymentTypes.Type t : PaymentTypes.Type.values()) {
                if (p.payments().isOn(t)) {
                    on.add(new PaymentDto(t, p.payments().handle(t).orElse(null)));
                }
            }
            return new CoachDetailsDto(p.shownPhone(), p.shownEmail(), on);
        }
    }

    public record CoachDto(String firstName, String lastName, String status, List<String> skaterNames,
                           List<String> waitingNames, CoachDetailsDto details) {
    }

    public record CoachStatusDto(String firstName, String lastName, String status) {
    }

    public record SkaterDto(String name, boolean isMinor, String skatingOrg, String registrationNumber,
                            List<CoachStatusDto> coaches) {
    }

    public record ContactDto(String firstName, String lastName, String email, String phone, String relationship) {
    }

    public record FamilyResponse(ContactDto contact, boolean waiting, List<SkaterDto> skaters, List<CoachDto> coaches) {
        public static FamilyResponse of(FamilyService.FamilyView v) {
            FamilyService.Contact c = v.contact();
            List<SkaterDto> skaters = v.skaters().stream().map(s -> new SkaterDto(s.name(), s.isMinor(), s.skatingOrg().name(),
                    s.registrationNumber(), s.coaches().stream()
                    .map(x -> new CoachStatusDto(x.firstName(), x.lastName(), x.status().name())).toList())).toList();
            List<CoachDto> coaches = v.coaches().stream().map(x -> new CoachDto(x.firstName(), x.lastName(), x.status().name(),
                    x.skaterNames(), x.waitingNames(), CoachDetailsDto.of(x.details()))).toList();
            return new FamilyResponse(new ContactDto(c.firstName(), c.lastName(), c.email(), c.phone(), c.relationship().name()),
                    v.waiting(), skaters, coaches);
        }
    }
}
