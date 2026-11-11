package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * A lesson time as a family's read returns it (ADR-031 decision 1; ADR-MASTER section 7): free ({@code OPEN})
 * or taken ({@code BOOKED} or {@code HELD}), its price and stamps, and nothing about who holds it. {@code shareCount}
 * and {@code joinOrder} are readable so a family can work out its own share; they show only random skater IDs.
 */
public record AvailableTime(LocalDate lessonDate, LocalTime startTime, Instant startsAtUtc, String coachTz,
                            int durationMinutes, int priceMinor, String currency, boolean free, int shareCount,
                            List<String> joinOrder, int blockSeq) {

    public AvailableTime {
        joinOrder = List.copyOf(joinOrder);
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
