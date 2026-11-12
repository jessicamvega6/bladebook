package com.bladebook.api.coach.dto;

import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.PaymentTypes.Type;
import com.bladebook.core.service.CoachProfileService;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** What api-coach sends and accepts for the profile. Records, so Jackson reads and writes them as is. */
public final class ProfileDtos {

    private ProfileDtos() {
    }

    /** One payment type's switch and handle. {@code handle} is null for cash. */
    public record PaymentTypeDto(Type type, boolean on, String handle) {
    }

    public record ProfileResponse(
            String firstName, String lastName, String initials,
            String loginEmail, String businessEmail, String pendingBusinessEmail,
            String phone, String coachTimezone, String currency, int requiredNoticeHours,
            String coachCode, boolean codeWorks,
            String paymentInstructions, List<PaymentTypeDto> paymentTypes,
            /* Profile → Visibility & texts: shown to approved families only. */
            boolean showPhone, boolean showEmail) {

        public static ProfileResponse of(CoachProfile p) {
            List<PaymentTypeDto> types = new ArrayList<>();
            for (Type t : Type.values()) {
                types.add(new PaymentTypeDto(t, p.payments().isOn(t), p.payments().handle(t).orElse(null)));
            }
            return new ProfileResponse(p.firstName(), p.lastName(), p.initials(),
                    p.loginEmail(), p.businessEmail(), p.pendingBusinessEmail(),
                    p.phone(), p.coachTimezone(), p.currency().name(), p.requiredNoticeHours(),
                    p.coachCode().display(), p.codeWorks(),
                    p.paymentInstructions(), types, p.displayPhoneToClients(), p.displayEmailToClients());
        }
    }

    /** Profile → Visibility & texts: the two contact switches. */
    public record VisibilityRequest(boolean showPhone, boolean showEmail) {
    }

    /** Sign-up step 3. */
    public record SignupRequest(
            String firstName, String lastName, boolean useLoginEmail, String businessEmail,
            String phone, String coachTimezone, String currency,
            String paymentInstructions, List<PaymentTypeDto> paymentTypes) {

        public CoachProfileService.BusinessDetails toDetails() {
            return new CoachProfileService.BusinessDetails(firstName, lastName, useLoginEmail, businessEmail,
                    phone, coachTimezone, currency, payments(paymentInstructions, paymentTypes));
        }
    }

    public record DetailsRequest(String firstName, String lastName, String phone, String coachTimezone) {

        public CoachProfileService.Details toDetails() {
            return new CoachProfileService.Details(firstName, lastName, phone, coachTimezone);
        }
    }

    public record PaymentsRequest(String paymentInstructions, List<PaymentTypeDto> paymentTypes) {

        public CoachProfileService.Payments toPayments() {
            return payments(paymentInstructions, paymentTypes);
        }
    }

    static CoachProfileService.Payments payments(String instructions, List<PaymentTypeDto> types) {
        Set<Type> on = EnumSet.noneOf(Type.class);
        Map<Type, String> handles = new EnumMap<>(Type.class);
        if (types != null) {
            for (PaymentTypeDto t : types) {
                if (t == null || t.type() == null) {
                    continue;
                }
                if (t.on()) {
                    on.add(t.type());
                }
                if (t.handle() != null && t.type().hasHandle()) {
                    handles.put(t.type(), t.handle());
                }
            }
        }
        return new CoachProfileService.Payments(instructions, on, handles);
    }
}
