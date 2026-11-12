package com.bladebook.core.service;

import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.BookingRepository.CoachClock;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LinkedCoach;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.BookingWindow;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Recurrence;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.ScheduleForDate;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.WeeklySchedule;
import com.bladebook.core.domain.Weeks;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Booking, on the family side (ADR-MASTER section 7; FeatureDecriptions/Bookings:). Batch 4 books single dates, one
 * skater per lesson; Batch 9 adds repeating bookings, with their headers. Sharing is Batch 11.
 *
 * <p>Every call names a coach and a skater, and is refused unless the skater is the family's and {@code ACTIVE}
 * with that coach ({@link ClientLinks#requireActive}). Dates and "now" are the coach's.
 */
public final class BookingService {

    /** One lesson time on the booking page. {@code free}: nobody holds it; who does is never shown. */
    public record Time(LocalDate date, LocalTime startTime, LocalTime endTime, int durationMinutes, int priceMinor,
                       String currency, int blockSeq, String blockName, boolean free, boolean started) {
    }

    /** One of the family's own lessons: any skater, with this coach (the booking page) or any coach (Home). */
    public record FamilyLesson(String coachId, String coachFirstName, String studentId, String studentName, LocalDate date,
                               LocalTime startTime, int durationMinutes, Instant startsAtUtc, String coachTz) {
    }

    /** Everything the booking pages need for one coach and skater: the whole window at once. */
    public record BookingPage(String coachFirstName, String coachLastName, String coachTimezone, int requiredNoticeHours,
                              LocalDate today, LocalTime now, LocalDate windowFirst, LocalDate windowLast,
                              boolean hasSchedule, List<Time> times, List<FamilyLesson> familyLessons,
                              List<BookingRepository.Special> specials) {

        public BookingPage {
            specials = List.copyOf(specials);
            times = List.copyOf(times);
            familyLessons = List.copyOf(familyLessons);
        }
    }

    /** What happened to one pick. The length and price are {@code null} when the time no longer exists. */
    public record PickResult(LocalDate date, LocalTime startTime, BookingOutcome outcome, Integer durationMinutes,
                             Integer priceMinor, String currency, String recurrenceId) {
    }

    /** One repeating pick: its series, how often, and the dates it runs between. */
    public record Series(String recurrenceId, DayOfWeek weekday, LocalTime startTime, int intervalWeeks, LocalDate first, LocalDate until) {
    }

    public record BookingResult(String coachFirstName, String studentName, List<PickResult> picks, List<Series> series) {

        public BookingResult {
            picks = List.copyOf(picks);
            series = List.copyOf(series);
        }
    }

    /** One of the family's lessons on My bookings, priced from its lesson time; {@code null} price if it can't be read. */
    /**
     * {@code attendance}: {@code CHECKED_IN} or {@code NO_SHOW} once the coach records it, else {@code null}.
     * {@code recurrenceId} and {@code intervalWeeks}: the series it belongs to and how often that repeats now, or null and 0.
     */
    public record MyLesson(FamilyLesson lesson, Integer priceMinor, String currency, int requiredNoticeHours, String attendance,
                           String recurrenceId, int intervalWeeks) {
    }

    /** A series still running: its header, whose it is, and how many lessons are left. */
    public record SeriesView(Recurrence recurrence, String coachFirstName, String studentName, int lessonsLeft, LocalDate lastLesson) {
    }

    /** My bookings: every lesson not started yet, soonest first, the last four that have, newest first, and the series. */
    public record MyBookings(List<MyLesson> upcoming, List<MyLesson> recent, List<SeriesView> series) {

        public MyBookings {
            upcoming = List.copyOf(upcoming);
            recent = List.copyOf(recent);
            series = List.copyOf(series);
        }
    }

    /** How far back My bookings looks for Recent. Older lessons are archived (ADR-017). */
    static final int RECENT_DAYS = 366;
    static final int RECENT_SHOWN = 4;

    private final ClientLinks links;
    private final BookingRepository bookings;
    private final FamilyRepository families;
    private final Clock clock;

    public BookingService(ClientLinks links, BookingRepository bookings, FamilyRepository families, Clock clock) {
        this.links = links;
        this.bookings = bookings;
        this.families = families;
        this.clock = clock;
    }

    /** The booking page for one skater with one coach: every lesson time in the window, and the family's own. */
    public BookingPage page(ClientContext ctx, String coachId, String studentId) {
        LinkedSkater skater = links.requireActive(ctx, coachId, studentId, "availability");
        CoachClock coach = coachOf(ctx, skater);
        Instant now = clock.instant();
        ZonedDateTime local = now.atZone(ZoneId.of(coach.coachTimezone()));
        BookingWindow window = BookingWindow.of(local.toLocalDate());

        List<AvailableTime> stored = bookings.times(ctx, skater.coach(), window.first(), window.last());
        WeeklySchedule weekly = bookings.weekly(ctx, skater.coach()).orElse(null);
        Map<LocalDate, List<ScheduleBlock>> overrides = bookings.overrides(ctx, skater.coach(), window.first(), window.last());
        List<Time> times = new ArrayList<>();
        for (AvailableTime t : stored) {
            times.add(new Time(t.lessonDate(), t.startTime(), t.endTime(), t.durationMinutes(), t.shareFor(studentId),
                    t.currency(), t.blockSeq(), blockName(t, weekly, overrides), t.free(), !t.startsAtUtc().isAfter(now)));
        }
        boolean hasSchedule = !times.isEmpty() || (weekly != null && !weekly.isEmpty());

        FamilyAccount account = account(ctx);
        List<FamilyLesson> mine = bookings.familySeats(ctx, window.first(), window.last()).stream()
                .filter(s -> s.coachId().equals(coachId)).map(s -> lesson(s, account)).toList();

        return new BookingPage(coach.firstName(), coach.lastName(), coach.coachTimezone(), coach.requiredNoticeHours(),
                local.toLocalDate(), local.toLocalTime().truncatedTo(ChronoUnit.MINUTES), window.first(), window.last(),
                hasSchedule, times, mine, bookings.specials(ctx, skater.coach(), window.first(), window.last()));
    }

    /**
     * Books each pick, one transaction per date. A pick that can't be booked doesn't stop the rest. One pick
     * outside the window refuses the whole request before anything is written.
     */
    public BookingResult book(ClientContext ctx, BookingRequest request) {
        LinkedSkater skater = links.requireActive(ctx, request.coachId(), request.studentId(), "book");
        CoachClock coach = coachOf(ctx, skater);
        Instant now = clock.instant();
        // The picks must be inside the window; a series' later dates may run past it, up to 12 months (ADR-031 d3).
        BookingWindow.at(now, ZoneId.of(coach.coachTimezone())).requireAll(request.dates());

        List<BookingRequest.Occurrence> dates = request.occurrences();
        Map<String, AvailableTime> byKey = new HashMap<>();
        for (AvailableTime t : bookings.times(ctx, skater.coach(), dates.get(0).date(), dates.get(dates.size() - 1).date())) {
            byKey.put(t.key(), t);
        }
        List<PickResult> out = new ArrayList<>();
        for (BookingRequest.Occurrence o : dates) {
            AvailableTime t = byKey.get(LessonTime.key(o.date(), o.startTime()));
            BookingOutcome outcome;
            if (t == null || !t.free()) {
                // Gone, or taken already: skip the write, and say whose by the family's own seat.
                outcome = bookings.attribute(ctx, skater, o.date(), o.startTime(), request.idempotencyKey());
            } else {
                outcome = bookings.book(ctx, skater, t, request.idempotencyKey(), now, o.recurrenceId(), o.intervalWeeks());
            }
            out.add(t == null
                    ? new PickResult(o.date(), o.startTime(), outcome, null, null, null, o.recurrenceId())
                    : new PickResult(o.date(), o.startTime(), outcome, t.durationMinutes(), t.shareFor(skater.studentId()), t.currency(),
                            o.recurrenceId()));
        }
        List<Series> series = new ArrayList<>();
        if (request.repeat() != null) {
            Map<String, List<PickResult>> byRid = new java.util.LinkedHashMap<>();
            out.forEach(r -> byRid.computeIfAbsent(r.recurrenceId(), k -> new ArrayList<>()).add(r));
            byRid.forEach((rid, rs) -> {
                PickResult first = rs.get(0);
                series.add(new Series(rid, first.date().getDayOfWeek(), first.startTime(), request.repeat().everyWeeks(), first.date(),
                        request.repeat().until()));
                // The header goes after the dates, only if one booked (ADR-MASTER section 7).
                if (rs.stream().anyMatch(r -> r.outcome() == BookingOutcome.BOOKED)) {
                    bookings.recurrences().putIfMissing(ctx, new Recurrence(skater.coachId(), rid, skater.studentId(), ctx.clientId(),
                            first.date().getDayOfWeek(), first.startTime(), request.repeat().everyWeeks(), request.repeat().until(), first.date(),
                            Recurrence.Status.ACTIVE));
                }
            });
        }
        return new BookingResult(coach.firstName(), skater.studentName(), out, series);
    }

    /** The family's lessons with every coach from today on, soonest first and priced: Home's Today and Coming up. */
    public List<MyLesson> upcoming(ClientContext ctx) {
        Instant now = clock.instant();
        // A day either side of UTC's today covers every coach's today; each seat is then held to its coach's.
        LocalDate from = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(1);
        List<Seat> seats = bookings.familySeats(ctx, from, Weeks.storeUntil(from)).stream()
                .filter(s -> !s.lessonDate().isBefore(LocalDate.ofInstant(now, ZoneId.of(s.coachTz()))))
                .sorted(Comparator.comparing(Seat::startsAtUtc)).toList();
        return priced(ctx, seats, account(ctx), headers(ctx));
    }

    /** My bookings (FeatureDecriptions/C_Client My Bookings.md), with every coach the family is approved with. */
    public MyBookings myBookings(ClientContext ctx) {
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<Seat> seats = bookings.familySeats(ctx, today.minusDays(RECENT_DAYS), Weeks.storeUntil(today));
        FamilyAccount account = account(ctx);
        Map<String, Recurrence> headers = repairHeaders(ctx, seats, now);
        List<MyLesson> upcoming = new ArrayList<>();
        List<MyLesson> recent = new ArrayList<>();
        for (MyLesson l : priced(ctx, seats, account, headers)) {
            (l.lesson().startsAtUtc().isAfter(now) ? upcoming : recent).add(l);
        }
        upcoming.sort(Comparator.comparing(l -> l.lesson().startsAtUtc()));
        recent.sort(Comparator.comparing((MyLesson l) -> l.lesson().startsAtUtc()).reversed());
        List<SeriesView> series = new ArrayList<>();
        for (Recurrence r : headers.values()) {
            List<MyLesson> left = upcoming.stream().filter(l -> r.recurrenceId().equals(l.recurrenceId())).toList();
            if (r.status() == Recurrence.Status.ACTIVE && !left.isEmpty()) {
                MyLesson any = left.get(0);
                series.add(new SeriesView(r, any.lesson().coachFirstName(), any.lesson().studentName(), left.size(),
                        left.get(left.size() - 1).lesson().date()));
            }
        }
        series.sort(Comparator.comparing((SeriesView v) -> v.studentName()).thenComparing(v -> v.recurrence().weekday())
                .thenComparing(v -> v.recurrence().startTime()));
        return new MyBookings(upcoming, recent.subList(0, Math.min(RECENT_SHOWN, recent.size())), series);
    }

    /** The family's series headers, by recurrence ID. */
    private Map<String, Recurrence> headers(ClientContext ctx) {
        Map<String, Recurrence> out = new java.util.LinkedHashMap<>();
        bookings.recurrences().list(ctx).forEach(r -> out.put(r.recurrenceId(), r));
        return out;
    }

    /**
     * Header repair (ADR-MASTER section 7): a series with a lesson still to come and no header gets one rebuilt from its seats,
     * written only if none exists. Returns every header, the rebuilt ones included.
     */
    private Map<String, Recurrence> repairHeaders(ClientContext ctx, List<Seat> seats, Instant now) {
        Map<String, Recurrence> out = headers(ctx);
        Map<String, List<Seat>> byRid = new java.util.LinkedHashMap<>();
        seats.stream().filter(s -> s.recurrenceId() != null).sorted(Comparator.comparing(Seat::startsAtUtc))
                .forEach(s -> byRid.computeIfAbsent(s.recurrenceId(), k -> new ArrayList<>()).add(s));
        byRid.forEach((rid, ss) -> {
            if (out.containsKey(rid) || ss.stream().noneMatch(s -> s.startsAtUtc().isAfter(now))) {
                return;
            }
            Seat first = ss.get(0), last = ss.get(ss.size() - 1);
            Recurrence rebuilt = new Recurrence(first.coachId(), rid, first.studentId(), first.clientId(), first.lessonDate().getDayOfWeek(),
                    first.startTime(), Math.max(1, first.bookedIntervalWeeks()), last.lessonDate(), first.lessonDate(), Recurrence.Status.ACTIVE);
            bookings.recurrences().putIfMissing(ctx, rebuilt);
            out.put(rid, rebuilt);
        });
        return out;
    }

    /** Each seat as a lesson, at the family's share of its lesson time's price, read for the coaches it's approved with. */
    private List<MyLesson> priced(ClientContext ctx, List<Seat> seats, FamilyAccount account, Map<String, Recurrence> headers) {
        Map<String, Map<String, AvailableTime>> times = new HashMap<>();
        for (LinkedCoach coach : families.linkedCoaches(ctx)) {
            List<String> keys = seats.stream().filter(s -> s.coachId().equals(coach.coachId()))
                    .map(s -> LessonTime.key(s.lessonDate(), s.startTime())).toList();
            if (coach.active() && !keys.isEmpty()) {
                times.put(coach.coachId(), bookings.timesAt(ctx, coach, keys));
            }
        }
        List<MyLesson> out = new ArrayList<>();
        for (Seat s : seats) {
            AvailableTime t = times.getOrDefault(s.coachId(), Map.of()).get(LessonTime.key(s.lessonDate(), s.startTime()));
            out.add(new MyLesson(lesson(s, account), t == null ? null : t.shareFor(s.studentId()), t == null ? null : t.currency(),
                    t == null ? 0 : t.requiredNoticeHours(),
                    s.seatStatus() == Seat.Status.CHECKED_IN || s.seatStatus() == Seat.Status.NO_SHOW ? s.seatStatus().name() : null,
                    s.recurrenceId(), s.recurrenceId() == null ? 0
                            : headers.containsKey(s.recurrenceId()) ? headers.get(s.recurrenceId()).intervalWeeks() : Math.max(1, s.bookedIntervalWeeks())));
        }
        return out;
    }

    private CoachClock coachOf(ClientContext ctx, LinkedSkater skater) {
        return bookings.coach(ctx, skater.coach())
                .orElseThrow(() -> DomainException.noSuchItem("That coach couldn’t be found. Reload the page."));
    }

    private FamilyAccount account(ClientContext ctx) {
        return families.account(ctx).orElseThrow(() -> DomainException.notFound("Finish signing up first."));
    }

    /** The seat's skater by their full name from the family's own records, and the coach's name from the link. */
    private static FamilyLesson lesson(Seat s, FamilyAccount a) {
        String name = a.skaters().stream().filter(k -> k.studentId().equals(s.studentId())).map(Skater::name)
                .findFirst().orElse(s.studentName());
        String coach = a.links().stream().filter(l -> l.coachId().equals(s.coachId())).map(SkaterLink::coachFirstName)
                .findFirst().orElse("");
        return new FamilyLesson(s.coachId(), coach, s.studentId(), name, s.lessonDate(), s.startTime(), s.durationMinutes(),
                s.startsAtUtc(), s.coachTz());
    }

    /** The block's name on that date, or {@code null} when it has none (the page labels it "Block N", S2). */
    private static String blockName(AvailableTime t, WeeklySchedule weekly, Map<LocalDate, List<ScheduleBlock>> overrides) {
        for (ScheduleBlock b : ScheduleForDate.blocks(t.lessonDate(), weekly, overrides)) {
            if (b.seq() == t.blockSeq()) {
                return b.blockName() == null || b.blockName().isBlank() ? null : b.blockName();
            }
        }
        return null;
    }
}
