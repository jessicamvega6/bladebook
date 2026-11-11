package com.bladebook.core.service;

import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.BookingRepository.CoachClock;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.domain.BookingWindow;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.ScheduleBlock;
import com.bladebook.core.domain.ScheduleForDate;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.WeeklySchedule;
import com.bladebook.core.domain.Weeks;

import java.time.Clock;
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
 * Booking one lesson, on the family side (ADR-MASTER section 7; FeatureDecriptions/Bookings:). Batch 4 books
 * single dates, one skater per lesson: repeating bookings are Batch 9 and sharing is Batch 11.
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
                              boolean hasSchedule, List<Time> times, List<FamilyLesson> familyLessons) {

        public BookingPage {
            times = List.copyOf(times);
            familyLessons = List.copyOf(familyLessons);
        }
    }

    /** What happened to one pick. The length and price are {@code null} when the time no longer exists. */
    public record PickResult(LocalDate date, LocalTime startTime, BookingOutcome outcome, Integer durationMinutes,
                             Integer priceMinor, String currency) {
    }

    public record BookingResult(String coachFirstName, String studentName, List<PickResult> picks) {

        public BookingResult {
            picks = List.copyOf(picks);
        }
    }

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
                hasSchedule, times, mine);
    }

    /**
     * Books each pick, one transaction per date. A pick that can't be booked doesn't stop the rest. One pick
     * outside the window refuses the whole request before anything is written.
     */
    public BookingResult book(ClientContext ctx, BookingRequest request) {
        LinkedSkater skater = links.requireActive(ctx, request.coachId(), request.studentId(), "book");
        CoachClock coach = coachOf(ctx, skater);
        Instant now = clock.instant();
        BookingWindow.at(now, ZoneId.of(coach.coachTimezone())).requireAll(request.dates());

        List<LocalDate> dates = request.dates();
        Map<String, AvailableTime> byKey = new HashMap<>();
        for (AvailableTime t : bookings.times(ctx, skater.coach(), dates.get(0), dates.get(dates.size() - 1))) {
            byKey.put(t.key(), t);
        }
        List<PickResult> out = new ArrayList<>();
        for (BookingRequest.Pick p : request.picks()) {
            AvailableTime t = byKey.get(LessonTime.key(p.date(), p.startTime()));
            BookingOutcome outcome;
            if (t == null) {
                outcome = bookings.attribute(ctx, skater, p.date(), p.startTime(), request.idempotencyKey());
            } else if (!t.free()) {
                // Taken already: skip the write, and say whose by the family's own seat.
                outcome = bookings.attribute(ctx, skater, p.date(), p.startTime(), request.idempotencyKey());
            } else {
                outcome = bookings.book(ctx, skater, t, request.idempotencyKey(), now);
            }
            out.add(t == null
                    ? new PickResult(p.date(), p.startTime(), outcome, null, null, null)
                    : new PickResult(p.date(), p.startTime(), outcome, t.durationMinutes(), t.shareFor(skater.studentId()), t.currency()));
        }
        return new BookingResult(coach.firstName(), skater.studentName(), out);
    }

    /** The family's lessons with every coach from today on, soonest first: Home's Today and Coming up. */
    public List<FamilyLesson> upcoming(ClientContext ctx) {
        Instant now = clock.instant();
        // A day either side of UTC's today covers every coach's today; each seat is then held to its coach's.
        LocalDate from = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(1);
        FamilyAccount account = account(ctx);
        return bookings.familySeats(ctx, from, Weeks.storeUntil(from)).stream()
                .filter(s -> !s.lessonDate().isBefore(LocalDate.ofInstant(now, ZoneId.of(s.coachTz()))))
                .sorted(Comparator.comparing(Seat::startsAtUtc))
                .map(s -> lesson(s, account)).toList();
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
