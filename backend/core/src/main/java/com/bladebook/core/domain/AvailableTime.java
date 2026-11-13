package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * A lesson time as a family's read returns it (ADR-031 decision 1; ADR-MASTER section 7): free ({@code OPEN})
 * or taken ({@code BOOKED} or {@code HELD}), its price and stamps, and nothing about who holds it. {@code shareCount}
 * and {@code joinOrder} are readable so a family can work out its own share; they show only random skater IDs.
 * {@code requiredNoticeHours} is the lesson's own notice period, which says whether a cancel is late (B6).
 *
 * <p>Batch 11 adds {@code shareable} (the block allows 2 or more skaters: families can tell a time can be shared, never how
 * many it takes) and {@code seatsTaken} (places held, an invitation included), which a family's own cancel needs to know
 * whether it leaves someone behind. Neither names anyone.
 */
public record AvailableTime(LocalDate lessonDate, LocalTime startTime, Instant startsAtUtc, String coachTz,
                            int durationMinutes, int priceMinor, String currency, boolean free, int shareCount,
                            List<String> joinOrder, int blockSeq, int requiredNoticeHours, boolean shareable, int seatsTaken) {

    public AvailableTime {
        joinOrder = List.copyOf(joinOrder);
    }

    /** A time that can't be shared, with no place counted (tests and older callers). */
    public AvailableTime(LocalDate lessonDate, LocalTime startTime, Instant startsAtUtc, String coachTz, int durationMinutes,
                         int priceMinor, String currency, boolean free, int shareCount, List<String> joinOrder, int blockSeq,
                         int requiredNoticeHours) {
        this(lessonDate, startTime, startsAtUtc, coachTz, durationMinutes, priceMinor, currency, free, shareCount, joinOrder, blockSeq,
                requiredNoticeHours, false, free ? 0 : 1);
    }

    public String key() {
        return LessonTime.key(lessonDate, startTime);
    }

    public LocalTime endTime() {
        return startTime.plusMinutes(durationMinutes);
    }

    /** Offered on the booking page: free and not started. The transaction decides. */
    public boolean canPick(Instant now) {
        return free && startsAtUtc.isAfter(now);
    }

    public int shareFor(String studentId) {
        return PriceShare.of(priceMinor, shareCount, joinOrder, studentId);
    }
}
