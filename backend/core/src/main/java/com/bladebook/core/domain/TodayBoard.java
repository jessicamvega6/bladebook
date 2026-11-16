package com.bladebook.core.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * The coach's Today page (G-6, Batch 22; design {@code coach/static/today.html}; FeatureDecriptions/Coach Dashboard on
 * website.md): today's lessons, each skater with their share of the price and their attendance, the next lesson marked,
 * and two figures: the lessons booked in a range (this week) and every lesson that has started and is still unpaid.
 *
 * <p>Everything is worked out from the lesson times and seats already stored (Batches 4 to 8); nothing is kept. A seat
 * still {@code INVITED} isn't in the lesson yet and counts nowhere. Shares come from the lesson time, as on Payments
 * ({@link LessonTime#shareFor}), so the two pages agree. Amounts are kept per currency, never added across.
 */
public final class TodayBoard {

    /** A seat with its payment as stored. */
    public record BoardSeat(Seat seat, Payment.Status payment) {
    }

    /** One skater in a lesson: the coach's full name for them, their share, and what their attendance shows. */
    public record Skater(String studentId, String name, int amountMinor, String currency, Attendance.Shown shown) {
    }

    /** A booked lesson time (its skaters in the order they joined) or a held one (no skaters). */
    public record Lesson(LessonTime time, List<Skater> skaters, boolean next) {

        public Lesson {
            skaters = List.copyOf(skaters);
        }

        public boolean held() {
            return time.lessonStatus() == LessonTime.Status.HELD;
        }
    }

    /** A count of skaters' lessons and their amounts per currency, by currency code. */
    public record Figures(int count, Map<String, Long> amounts) {

        public Figures {
            amounts = Collections.unmodifiableMap(new TreeMap<>(amounts));
        }
    }

    private final Map<String, LessonTime> times = new HashMap<>();
    /** Each lesson time's skaters, in the order they joined, at their share. */
    private final Map<String, List<Skater>> skaters = new TreeMap<>();
    private final Map<String, Seat> seatOf = new HashMap<>();
    private final Map<String, Payment.Status> paymentOf = new HashMap<>();
    private final String currency;
    private final Instant now;

    /**
     * {@code names}: the coach's own name for each skater (their {@code STUDENT#} record); a skater no longer on the list
     * is shown by the name on the seat. {@code currency}: the coach's, for a seat whose lesson time is missing.
     */
    public TodayBoard(List<LessonTime> lessonTimes, List<BoardSeat> seats, Map<String, String> names, String currency, Instant now) {
        this.currency = currency;
        this.now = now;
        lessonTimes.forEach(t -> times.put(t.key(), t));
        Map<String, List<BoardSeat>> byTime = new LinkedHashMap<>();
        for (BoardSeat s : seats) {
            if (s.seat().seatStatus() != Seat.Status.INVITED) {
                byTime.computeIfAbsent(LessonTime.key(s.seat().lessonDate(), s.seat().startTime()), k -> new ArrayList<>()).add(s);
            }
        }
        byTime.forEach((key, in) -> {
            in.sort(Comparator.comparing((BoardSeat s) -> s.seat().joinedAt()).thenComparing(s -> s.seat().studentId()));
            List<String> order = in.stream().map(s -> s.seat().studentId()).toList();
            LessonTime t = times.get(key);
            List<Skater> out = new ArrayList<>();
            for (BoardSeat s : in) {
                Seat seat = s.seat();
                int amount = t == null ? 0 : t.shareFor(t.priceMinor(), seat.studentId(), order);
                out.add(new Skater(seat.studentId(), names.getOrDefault(seat.studentId(), seat.studentName()), amount,
                        t == null ? currency : t.currency(),
                        Attendance.statusOf(seat.seatStatus(), seat.startsAtUtc(), seat.durationMinutes(), now)));
                seatOf.put(seat.key(), seat);
                paymentOf.put(seat.key(), s.payment());
            }
            skaters.put(key, out);
        });
    }

    /** {@code date}'s booked and held lesson times, earliest first; the first booked one not yet started is next. */
    public List<Lesson> day(LocalDate date) {
        List<LessonTime> on = times.values().stream()
                .filter(t -> t.lessonDate().equals(date) && t.lessonStatus() != LessonTime.Status.OPEN)
                .sorted(Comparator.comparing(LessonTime::startTime)).toList();
        List<Lesson> out = new ArrayList<>();
        boolean nextFound = false;
        for (LessonTime t : on) {
            List<Skater> in = t.lessonStatus() == LessonTime.Status.HELD ? List.of() : skaters.getOrDefault(t.key(), List.of());
            if (t.lessonStatus() == LessonTime.Status.BOOKED && in.isEmpty()) {
                continue;
            }
            boolean next = !nextFound && !in.isEmpty() && t.startsAtUtc().isAfter(now);
            nextFound |= next;
            out.add(new Lesson(t, in, next));
        }
        return out;
    }

    /** Every skater's lesson dated {@code from} to {@code to}, whatever happened at it or was paid. */
    public Figures booked(LocalDate from, LocalDate to) {
        return figures(seatOf.values().stream()
                .filter(s -> !s.lessonDate().isBefore(from) && !s.lessonDate().isAfter(to)).map(Seat::key).toList());
    }

    /** Every skater's lesson that has started and is still unpaid, no-shows included (ADR-015 d4). */
    public Figures unpaid() {
        return figures(seatOf.values().stream()
                .filter(s -> s.hasStarted(now) && paymentOf.get(s.key()) == Payment.Status.UNPAID).map(Seat::key).toList());
    }

    /** The first date after {@code date} with a booked skater, if any of the seats given has one. */
    public Optional<LocalDate> nextLessonAfter(LocalDate date) {
        return seatOf.values().stream().map(Seat::lessonDate).filter(d -> d.isAfter(date)).min(Comparator.naturalOrder());
    }

    private Figures figures(List<String> seatKeys) {
        List<Payment.Amount> amounts = new ArrayList<>();
        for (String key : seatKeys) {
            Seat seat = seatOf.get(key);
            skaters.get(LessonTime.key(seat.lessonDate(), seat.startTime())).stream()
                    .filter(k -> k.studentId().equals(seat.studentId()))
                    .forEach(k -> amounts.add(new Payment.Amount(k.amountMinor(), k.currency())));
        }
        return new Figures(seatKeys.size(), Payment.totals(amounts));
    }
}
