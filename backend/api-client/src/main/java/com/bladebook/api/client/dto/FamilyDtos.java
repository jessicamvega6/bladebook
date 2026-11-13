package com.bladebook.api.client.dto;

import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.CoachPublicProfile;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.service.FamilyService;
import com.bladebook.core.service.RegistrationService;

import java.util.ArrayList;
import java.util.List;

/**
 * What the family website sends and gets back. The only IDs that leave api-client are the family's own:
 * its skaters' IDs, and the ID of each coach who has approved one of its skaters (a waiting family gets no
 * coach ID). Booking sends them back, and every one is checked against the family's links (ADR-MASTER
 * section 16). Another family's IDs never leave.
 */
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

    /** Profile → Add a skater. {@code coachIds}: approved coaches only, the IDs this API gave the family. */
    public record AddSkaterBody(String name, String skatingOrg, String registrationNumber, List<String> coachIds, boolean noCoach) {
        public RegistrationService.AddSkater toRequest() {
            return new RegistrationService.AddSkater(name, skatingOrg, registrationNumber, coachIds, noCoach);
        }
    }

    /** Profile → Add a coach: the coach's code, resolved on the server, and the family's skaters who'll join them. */
    public record AddCoachBody(String coachCode, List<String> studentIds) {
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

    public record CoachDto(String coachId, String firstName, String lastName, String status, List<String> skaterNames,
                           List<String> waitingNames, CoachDetailsDto details) {
    }

    public record CoachStatusDto(String coachId, String firstName, String lastName, String status) {
    }

    public record SkaterDto(String studentId, String name, boolean isMinor, String skatingOrg, String registrationNumber,
                            List<CoachStatusDto> coaches) {
    }

    public record ContactDto(String firstName, String lastName, String email, String phone, String relationship) {
    }

    public record FamilyResponse(ContactDto contact, boolean waiting, List<SkaterDto> skaters, List<CoachDto> coaches) {
        public static FamilyResponse of(FamilyService.FamilyView v) {
            FamilyService.Contact c = v.contact();
            List<SkaterDto> skaters = v.skaters().stream().map(s -> new SkaterDto(s.studentId(), s.name(), s.isMinor(), s.skatingOrg().name(),
                    s.registrationNumber(), s.coaches().stream()
                    .map(x -> new CoachStatusDto(activeOnly(x.coachId(), x.status()), x.firstName(), x.lastName(), x.status().name())).toList())).toList();
            List<CoachDto> coaches = v.coaches().stream().map(x -> new CoachDto(activeOnly(x.coachId(), x.status()), x.firstName(), x.lastName(), x.status().name(),
                    x.skaterNames(), x.waitingNames(), CoachDetailsDto.of(x.details()))).toList();
            return new FamilyResponse(new ContactDto(c.firstName(), c.lastName(), c.email(), c.phone(), c.relationship().name()),
                    v.waiting(), skaters, coaches);
        }
    }

    /** A coach's ID only once they've approved: a waiting family reads nothing of the coach but the name. */
    private static String activeOnly(String coachId, StudentStatus status) {
        return status == StudentStatus.ACTIVE ? coachId : null;
    }
}
