package com.bladebook.core.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Overlaps between a skater's lessons (ADR-MASTER section 7, "Clash warning, not refusal"; ADR-025 d5): any overlap in
 * time clashes, lessons that only touch don't, and every clashing date is listed (B7). A warning, never a refusal. Times
 * are each coach's local ones; MVP coaches share one rink, so they compare as they are.
 */
public final class Clashes {

    /** One lesson: its local date and start, its length, and whose it is. */
    public record Slot(LocalDate date, LocalTime startTime, int durationMinutes, String coachId) {

        LocalTime end() {
            return startTime.plusMinutes(durationMinutes);
        }

        boolean sameAs(Slot o) {
            return date.equals(o.date) && startTime.equals(o.startTime) && coachId.equals(o.coachId);
        }
    }

    /** {@code lesson} overlaps {@code other}. */
    public record Clash(Slot lesson, Slot other) {
    }

    private Clashes() {
    }

    /** Every pair where one of {@code lessons} overlaps one of {@code others}, in date and time order. */
    public static List<Clash> of(List<Slot> lessons, List<Slot> others) {
        List<Clash> out = new ArrayList<>();
        for (Slot a : lessons) {
            for (Slot b : others) {
                if (a.date().equals(b.date()) && !a.sameAs(b) && a.startTime().isBefore(b.end()) && b.startTime().isBefore(a.end())) {
                    out.add(new Clash(a, b));
                }
            }
        }
        out.sort(Comparator.comparing((Clash c) -> c.lesson().date()).thenComparing(c -> c.lesson().startTime())
                .thenComparing(c -> c.other().startTime()));
        return out;
    }
}
