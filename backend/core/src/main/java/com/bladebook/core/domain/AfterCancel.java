package com.bladebook.core.domain;

/**
 * What happens to a lesson time once its cancelled seats have gone (ADR-MASTER section 10; S9, owner 2026-11-08).
 * {@code RELEASE}: families can book it again. {@code HOLD}: it stays closed to families, with no skater in it,
 * and there is no way to release it later. A family's own cancel always releases.
 */
public enum AfterCancel {
    RELEASE, HOLD;

    /** The lesson time's status after the cancel, with {@code seatsLeft} seats still in it. */
    public LessonTime.Status lessonStatus(int seatsLeft) {
        if (seatsLeft > 0) {
            return LessonTime.Status.BOOKED;
        }
        return this == RELEASE ? LessonTime.Status.OPEN : LessonTime.Status.HELD;
    }

    public static AfterCancel parse(String value) {
        if ("RELEASE".equals(value)) {
            return RELEASE;
        }
        if ("HOLD".equals(value)) {
            return HOLD;
        }
        throw DomainException.invalid("after", "Choose release or hold for each lesson.");
    }
}
