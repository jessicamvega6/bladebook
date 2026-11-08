package com.bladebook.core.domain;

import java.util.Objects;

/**
 * {@code COACH#<coachId> / PROFILE} (ADR-MASTER section 4). Values are already checked by
 * {@link ProfileRules}; this class only holds them.
 *
 * <p>{@code businessEmail} holds only a <b>confirmed</b> address, or the login email. While a
 * different address waits for its link it sits in {@code pendingBusinessEmail}, {@code businessEmail}
 * is empty, and the coach code doesn't work (ADR-016, amended 2026-11-06).
 */
public final class CoachProfile {

    public enum Currency { USD, CAD }

    public static final int DEFAULT_NOTICE_HOURS = 24;

    private final String coachId;
    private final String firstName;
    private final String lastName;
    private final String loginEmail;
    private final String businessEmail;
    private final String pendingBusinessEmail;
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
        this.pendingBusinessEmail = b.pendingBusinessEmail;
        this.phone = b.phone;
        this.coachTimezone = Objects.requireNonNull(b.coachTimezone, "coachTimezone");
        this.currency = Objects.requireNonNull(b.currency, "currency");
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
        b.pendingBusinessEmail = pendingBusinessEmail;
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
    public String pendingBusinessEmail() { return pendingBusinessEmail; }
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
                && Objects.equals(pendingBusinessEmail, p.pendingBusinessEmail)
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
        private String pendingBusinessEmail;
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
        public Builder pendingBusinessEmail(String v) { pendingBusinessEmail = v; return this; }
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
