package com.bladebook.core.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * {@code COACH#<coachId> / PROFILE} (ADR-MASTER section 4). Values are already checked by
 * {@link ProfileRules}; this class only holds them.
 *
 * <p>{@code businessEmail} holds only a <b>confirmed</b> address, or the login email. An address waiting for its link
 * sits in {@code pendingBusinessEmails} with its token's hash and expiry (ADR-016, amended 2026-11-12); while a new
 * coach's first address waits, {@code businessEmail} is empty and the coach code doesn't work (ADR-016, amended
 * 2026-11-06). {@code confirmedBusinessEmails} are the other confirmed addresses on Profile → Business email's list.
 */
public final class CoachProfile {

    public enum Currency { USD, CAD }

    public static final int DEFAULT_NOTICE_HOURS = 24;
    /**
     * The shortest notice a coach may have (owner, 2026-11-23): editable from Phase 2, up but never below this. It keeps a
     * shared lesson's answer-by time a day before the lesson, well before check-in opens.
     */
    public static final int MIN_NOTICE_HOURS = 24;

    private final String coachId;
    private final String firstName;
    private final String lastName;
    private final String loginEmail;
    private final String businessEmail;
    private final List<String> confirmedBusinessEmails;
    private final Map<String, BusinessEmails.Link> pendingBusinessEmails;
    private final long businessEmailsVersion;
    private final String phone;
    private final String coachTimezone;
    private final Currency currency;
    private final int requiredNoticeHours;
    private final CoachCode coachCode;
    private final String paymentInstructions;
    private final PaymentTypes payments;
    private final boolean displayPhoneToClients;
    private final boolean displayEmailToClients;
    private final boolean smsCancellationAlerts;

    private CoachProfile(Builder b) {
        this.coachId = Objects.requireNonNull(b.coachId, "coachId");
        this.firstName = Objects.requireNonNull(b.firstName, "firstName");
        this.lastName = Objects.requireNonNull(b.lastName, "lastName");
        this.loginEmail = Objects.requireNonNull(b.loginEmail, "loginEmail");
        this.businessEmail = b.businessEmail;
        this.confirmedBusinessEmails = List.copyOf(b.confirmedBusinessEmails);
        this.pendingBusinessEmails = Map.copyOf(b.pendingBusinessEmails);
        this.businessEmailsVersion = b.businessEmailsVersion;
        this.phone = b.phone;
        this.coachTimezone = Objects.requireNonNull(b.coachTimezone, "coachTimezone");
        this.currency = Objects.requireNonNull(b.currency, "currency");
        if (b.requiredNoticeHours < MIN_NOTICE_HOURS) {
            throw DomainException.invalid("requiredNoticeHours", "Notice must be at least 24 hours.");
        }
        this.requiredNoticeHours = b.requiredNoticeHours;
        this.coachCode = Objects.requireNonNull(b.coachCode, "coachCode");
        this.paymentInstructions = b.paymentInstructions;
        this.payments = Objects.requireNonNull(b.payments, "payments");
        this.displayPhoneToClients = b.displayPhoneToClients;
        this.displayEmailToClients = b.displayEmailToClients;
        this.smsCancellationAlerts = b.smsCancellationAlerts;
    }

    public static Builder builder() {
        return new Builder();
    }

    public Builder toBuilder() {
        Builder b = new Builder();
        b.coachId = coachId;
        b.firstName = firstName;
        b.lastName = lastName;
        b.loginEmail = loginEmail;
        b.businessEmail = businessEmail;
        b.confirmedBusinessEmails = confirmedBusinessEmails;
        b.pendingBusinessEmails = pendingBusinessEmails;
        b.businessEmailsVersion = businessEmailsVersion;
        b.phone = phone;
        b.coachTimezone = coachTimezone;
        b.currency = currency;
        b.requiredNoticeHours = requiredNoticeHours;
        b.coachCode = coachCode;
        b.paymentInstructions = paymentInstructions;
        b.payments = payments;
        b.displayPhoneToClients = displayPhoneToClients;
        b.displayEmailToClients = displayEmailToClients;
        b.smsCancellationAlerts = smsCancellationAlerts;
        return b;
    }

    /** The code works (its {@code CODE#} item exists) only once there is a confirmed business email. */
    public boolean codeWorks() {
        return businessEmail != null;
    }

    /** Shown in place of a photo in MVP. */
    public String initials() {
        return firstName.substring(0, 1).toUpperCase() + lastName.substring(0, 1).toUpperCase();
    }

    public String coachId() { return coachId; }
    public String firstName() { return firstName; }
    public String lastName() { return lastName; }
    public String loginEmail() { return loginEmail; }
    /** The confirmed business email, or {@code null} while one waits for its link. */
    public String businessEmail() { return businessEmail; }
    /** The confirmed addresses on the list other than the login email (Profile → Business email). */
    public List<String> confirmedBusinessEmails() { return confirmedBusinessEmails; }
    /** The addresses waiting for their link: address → the token's hash and when the link stops working. */
    public Map<String, BusinessEmails.Link> pendingBusinessEmails() { return pendingBusinessEmails; }
    /** Goes up by one with each change to the list, so two changes at once can't both land (single-use links). */
    public long businessEmailsVersion() { return businessEmailsVersion; }
    /** The waiting address whose link went out last, or {@code null}: what the "not working yet" banner names. */
    public String pendingBusinessEmail() { return businessEmails().newestPending().orElse(null); }

    /** The whole list, for a change to it ({@link Builder#businessEmails}). */
    public BusinessEmails businessEmails() {
        return new BusinessEmails(loginEmail, businessEmail, confirmedBusinessEmails, pendingBusinessEmails);
    }
    public String phone() { return phone; }
    public String coachTimezone() { return coachTimezone; }
    public Currency currency() { return currency; }
    public int requiredNoticeHours() { return requiredNoticeHours; }
    public CoachCode coachCode() { return coachCode; }
    public String paymentInstructions() { return paymentInstructions; }
    public PaymentTypes payments() { return payments; }
    public boolean displayPhoneToClients() { return displayPhoneToClients; }
    public boolean displayEmailToClients() { return displayEmailToClients; }
    public boolean smsCancellationAlerts() { return smsCancellationAlerts; }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof CoachProfile)) {
            return false;
        }
        CoachProfile p = (CoachProfile) o;
        return requiredNoticeHours == p.requiredNoticeHours
                && displayPhoneToClients == p.displayPhoneToClients
                && displayEmailToClients == p.displayEmailToClients
                && smsCancellationAlerts == p.smsCancellationAlerts
                && coachId.equals(p.coachId) && firstName.equals(p.firstName) && lastName.equals(p.lastName)
                && loginEmail.equals(p.loginEmail)
                && Objects.equals(businessEmail, p.businessEmail)
                && confirmedBusinessEmails.equals(p.confirmedBusinessEmails)
                && pendingBusinessEmails.equals(p.pendingBusinessEmails)
                && businessEmailsVersion == p.businessEmailsVersion
                && Objects.equals(phone, p.phone)
                && coachTimezone.equals(p.coachTimezone) && currency == p.currency
                && coachCode.equals(p.coachCode)
                && Objects.equals(paymentInstructions, p.paymentInstructions)
                && payments.equals(p.payments);
    }

    @Override
    public int hashCode() {
        return Objects.hash(coachId, firstName, lastName, loginEmail, businessEmail, coachCode);
    }

    /** No personal data: only the ID. */
    @Override
    public String toString() {
        return "CoachProfile[" + coachId + "]";
    }

    public static final class Builder {
        private String coachId;
        private String firstName;
        private String lastName;
        private String loginEmail;
        private String businessEmail;
        private List<String> confirmedBusinessEmails = List.of();
        private Map<String, BusinessEmails.Link> pendingBusinessEmails = Map.of();
        private long businessEmailsVersion;
        private String phone;
        private String coachTimezone;
        private Currency currency = Currency.USD;
        private int requiredNoticeHours = DEFAULT_NOTICE_HOURS;
        private CoachCode coachCode;
        private String paymentInstructions;
        private PaymentTypes payments = PaymentTypes.none();
        private boolean displayPhoneToClients;
        private boolean displayEmailToClients;
        private boolean smsCancellationAlerts;

        private Builder() {
        }

        public Builder coachId(String v) { coachId = v; return this; }
        public Builder firstName(String v) { firstName = v; return this; }
        public Builder lastName(String v) { lastName = v; return this; }
        public Builder loginEmail(String v) { loginEmail = v; return this; }
        public Builder businessEmail(String v) { businessEmail = v; return this; }
        public Builder confirmedBusinessEmails(List<String> v) { confirmedBusinessEmails = v; return this; }
        public Builder pendingBusinessEmails(Map<String, BusinessEmails.Link> v) { pendingBusinessEmails = v; return this; }
        public Builder businessEmailsVersion(long v) { businessEmailsVersion = v; return this; }

        /** Takes the current address and both lists from {@code b}; the login email isn't changed. */
        public Builder businessEmails(BusinessEmails b) {
            businessEmail = b.current();
            confirmedBusinessEmails = b.confirmed();
            pendingBusinessEmails = new LinkedHashMap<>(b.pending());
            return this;
        }
        public Builder phone(String v) { phone = v; return this; }
        public Builder coachTimezone(String v) { coachTimezone = v; return this; }
        public Builder currency(Currency v) { currency = v; return this; }
        public Builder requiredNoticeHours(int v) { requiredNoticeHours = v; return this; }
        public Builder coachCode(CoachCode v) { coachCode = v; return this; }
        public Builder paymentInstructions(String v) { paymentInstructions = v; return this; }
        public Builder payments(PaymentTypes v) { payments = v; return this; }
        public Builder displayPhoneToClients(boolean v) { displayPhoneToClients = v; return this; }
        public Builder displayEmailToClients(boolean v) { displayEmailToClients = v; return this; }
        public Builder smsCancellationAlerts(boolean v) { smsCancellationAlerts = v; return this; }

        public CoachProfile build() {
            return new CoachProfile(this);
        }
    }
}
