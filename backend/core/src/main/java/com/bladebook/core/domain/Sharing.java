package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * The rules of a shared lesson that need no database (ADR-MASTER section 8; ADR-031; ADR-033).
 *
 * <p>On a lesson time, {@code seatsTaken} counts every place held, an invited one included, and {@code shareCount}
 * counts the skaters splitting the price: an {@code INVITED} seat doesn't count, a late leaver still does, and an in-time
 * leaver does until the staying family answers.
 */
public final class Sharing {

    /** How long the staying family has at most to answer after the other skater leaves in time. */
    public static final Duration ANSWER_WITHIN = Duration.ofDays(7);

    private Sharing() {
    }

    /** What a family's cancel of its own booked seat does to the lesson. */
    public enum Leave {
        /** The only skater left: the time goes back on the coach's calendar (and any pending leave is cleared). */
        RELEASE,
        /** The other place is an unanswered invitation: it ends {@code WITHDRAWN} with this cancel, and the time is released. */
        WITHDRAW,
        /** Outside the notice period, the other skater joined: the staying family is asked to keep or cancel. */
        IN_TIME,
        /** Inside the notice period: the staying skater keeps their share and isn't asked. */
        LATE
    }

    /**
     * @param seatsTaken places held on the lesson time, this skater's included
     * @param shareCount skaters splitting the price
     * @param late       the cancel is inside the lesson's notice period
     */
    public static Leave leave(int seatsTaken, int shareCount, boolean late) {
        if (seatsTaken < 1) {
            throw new IllegalArgumentException("no seat to leave");
        }
        if (seatsTaken == 1) {
            return Leave.RELEASE;
        }
        if (shareCount < 2) {
            return Leave.WITHDRAW;
        }
        return late ? Leave.LATE : Leave.IN_TIME;
    }

    /**
     * When the staying family must answer by (B2): whichever comes first, the start of that lesson's notice period or
     * 7 days after the leave.
     */
    public static Instant answerBy(Instant startsAtUtc, int requiredNoticeHours, Instant leftAt) {
        Instant noticeStarts = startsAtUtc.minus(Duration.ofHours(requiredNoticeHours));
        Instant week = leftAt.plus(ANSWER_WITHIN);
        return noticeStarts.isBefore(week) ? noticeStarts : week;
    }

    /** An invitation still unanswered once its lesson has started has expired (B8): worked out from the clock. */
    public static boolean expired(Instant startsAtUtc, Instant now) {
        return !now.isBefore(startsAtUtc);
    }

    /** A staying family's date past its answer-by time with no answer is cancelled with no charge (B8). */
    public static boolean noAnswer(Instant answerBy, Instant now) {
        return answerBy != null && !now.isBefore(answerBy);
    }

    /** GSI4's sort key: {@code <dueAtUtc>#<coachId>#<itemKey>}, the time in whole seconds so text order is time order. */
    public static String dueKey(Instant dueAt, String coachId, String itemKey) {
        return dueAt.truncatedTo(ChronoUnit.SECONDS) + "#" + coachId + "#" + itemKey;
    }
}
