package com.bladebook.core.domain;

/**
 * A rule the request broke. The API layer turns {@link Reason} into an HTTP status. Messages are
 * written for the coach to read, and never echo back what was typed.
 */
public final class DomainException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /** Why the request was refused. */
    public enum Reason { INVALID, NOT_FOUND, CONFLICT }

    private final Reason reason;
    private final String field;

    private DomainException(Reason reason, String field, String message) {
        super(message);
        this.reason = reason;
        this.field = field;
    }

    /** A field broke a rule. {@code field} is the attribute name, so the website can mark that field. */
    public static DomainException invalid(String field, String message) {
        return new DomainException(Reason.INVALID, field, message);
    }

    public static DomainException notFound(String message) {
        return new DomainException(Reason.NOT_FOUND, null, message);
    }

    public static DomainException conflict(String message) {
        return new DomainException(Reason.CONFLICT, null, message);
    }

    public Reason reason() {
        return reason;
    }

    /** The field at fault, or {@code null}. */
    public String field() {
        return field;
    }
}
