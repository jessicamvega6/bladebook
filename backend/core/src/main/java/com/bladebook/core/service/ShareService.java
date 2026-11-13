package com.bladebook.core.service;

import com.bladebook.core.data.BookingRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ClientLinks;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LinkedCoach;
import com.bladebook.core.data.LinkedSkater;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.AvailableTime;
import com.bladebook.core.domain.Clashes;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.PriceShare;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.Sharing;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.domain.Weeks;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Shared lessons on the family side (ADR-MASTER section 8; ADR-026, ADR-031, ADR-033; FeatureDecriptions/Schedule lesson
 * split): the share-check, the invited family's invitations and their answer, withdrawing an invitation, the staying
 * family's "Keep it", and inviting a skater to a freed place. Booking with a share code is {@link BookingService}; a
 * family's cancel of a shared lesson is {@link CancellationService}.
 *
 * <p>Every call acts for the signed-in family on its own seats only. Each write is one date in its own transaction; a
 * series answers date by date, and dates that started, were answered or were cancelled meanwhile are skipped and reported.
 */
public final class ShareService {

    /** The share-check's answer (ADR-033 d2a): the display name, and whether the coach has accepted the skater. */
    public record ShareCheck(String displayName, boolean onCoachRoster) {
    }

    /** One date of an invitation. {@code open}: still waiting and not started; otherwise it has expired (B8). */
    public record InvitationDate(LocalDate date, LocalTime startTime, int durationMinutes, Instant startsAtUtc, boolean open) {
    }

    /** One clash for the invitation page: the invited date, and the skater's other lesson it overlaps (B7: every one). */
    public record InvitationClash(LocalDate date, LocalTime startTime, String otherCoachFirstName, LocalTime otherStart,
                                  int otherDurationMinutes) {
    }

    /**
     * An invitation to the signed-in family (design {@code invite}): who invited, for whom, with which coach, the dates, the
     * price and the skater's share once they join ({@code shareMinor} of {@code priceMinor}, split between {@code skaters}),
     * and every clash. {@code status} is {@code OPEN} while any date can still be answered, else {@code EXPIRED}.
     */
    public record Invitation(String inviteId, String coachId, String coachFirstName, String coachLastName, String studentId,
                             String studentName, String hostName, String invitedByName, boolean series, List<InvitationDate> dates,
                             Integer priceMinor, Integer shareMinor, int skaters, String currency, String status,
                             List<InvitationClash> clashes) {
    }

    /** An answer to several dates: those it was carried out on, and those that had gone. */
    public record Answered(String studentName, String coachFirstName, String hostName, List<LocalDate> done, List<LocalDate> skipped) {
    }

    /** A freed place filled: the skater's display name, and whether they were added directly (a sibling). */
    public record Filled(String displayName, boolean sibling) {
    }

    static final String GONE = "This lesson is no longer available.";
    static final String NO_SUCH_CODE = "That code doesn’t match a skater. Check it with the other family.";

    private final ClientLinks links;
    private final BookingRepository bookings;
    private final FamilyRepository families;
    private final ShareRepository shares;
    private final Partners partners;
    private final SeatEvents events;
    private final Clock clock;

    public ShareService(ClientLinks links, BookingRepository bookings, FamilyRepository families, ShareRepository shares,
                        CancellationRepository cancels, Clock clock, SeatEvents events) {
        this.links = links;
        this.bookings = bookings;
        this.families = families;
        this.shares = shares;
        this.partners = new Partners(links, families, shares);
        this.events = events;
        this.clock = clock;
    }

    // ------------------------------------------------------------------- the share-check

    /**
     * {@code POST /api/client/share-check} (ADR-033 d2a): a code's display name, and {@code onCoachRoster} true only when
     * that coach has accepted the skater ({@code PENDING} and never-a-student both answer false). The caller must have a
     * skater {@code ACTIVE} with the coach, else the ordinary 404; so must the code exist. Advice for the screen: the booking
     * checks again.
     */
    public ShareCheck check(ClientContext ctx, String coachId, String code) {
        LinkedCoach coach = families.linkedCoaches(ctx).stream().filter(c -> c.coachId().equals(coachId) && c.active()).findFirst()
                .orElseThrow(() -> DomainException.noSuchItem("That coach couldn’t be found. Reload the page."));
        ShareRepository.CodeMatch match = shares.shareCode(code).orElseThrow(() -> DomainException.noSuchItem(NO_SUCH_CODE));
        boolean on = shares.rosterStatus(ctx, coach, match.studentId()).filter(s -> s == StudentStatus.ACTIVE).isPresent();
        // The access-log line (ADR-MASTER section 18); locally, the application log (a listed shortcut, SC-15).
        System.getLogger("bladebook.access").log(System.Logger.Level.INFO, "share-check family={0} coach={1} onCoachRoster={2}",
                ctx.clientId(), coachId, on);
        return new ShareCheck(match.displayName(), on);
    }

    // ------------------------------------------------------------- the invited family

    /** Every invitation to the family's skaters, newest lesson last; an expired one stays until the sweep ends it. */
    public List<Invitation> invitations(ClientContext ctx) {
        Instant now = clock.instant();
        LocalDate from = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(1);
        List<Seat> all = bookings.familySeats(ctx, from, Weeks.storeUntil(from));
        Map<String, List<Seat>> byInvite = new LinkedHashMap<>();
        all.stream().filter(s -> s.seatStatus() == Seat.Status.INVITED && s.share().inviteId() != null)
                .sorted(Comparator.comparing(Seat::startsAtUtc))
                .forEach(s -> byInvite.computeIfAbsent(s.share().inviteId(), k -> new ArrayList<>()).add(s));
        if (byInvite.isEmpty()) {
            return List.of();
        }
        FamilyAccount account = families.account(ctx).orElseThrow(() -> DomainException.notFound("Finish signing up first."));
        List<Seat> lessons = all.stream().filter(s -> s.seatStatus() != Seat.Status.INVITED).toList();
        List<Invitation> out = new ArrayList<>();
        for (List<Seat> seats : byInvite.values()) {
            out.add(invitation(ctx, account, seats, lessons, now));
        }
        return out;
    }

    private Invitation invitation(ClientContext ctx, FamilyAccount account, List<Seat> seats, List<Seat> lessons, Instant now) {
        Seat first = seats.get(0);
        SkaterLink link = account.links().stream().filter(l -> l.coachId().equals(first.coachId()) && l.studentId().equals(first.studentId()))
                .findFirst().orElse(null);
        String name = account.skaters().stream().filter(k -> k.studentId().equals(first.studentId())).map(Skater::name).findFirst()
                .orElse(first.studentName());
        Map<String, AvailableTime> times = Map.of();
        Optional<LinkedCoach> coach = families.linkedCoaches(ctx).stream().filter(c -> c.coachId().equals(first.coachId())).findFirst();
        if (coach.isPresent()) {
            times = bookings.timesAt(ctx, coach.get(), seats.stream().map(s -> LessonTime.key(s.lessonDate(), s.startTime())).toList());
        }
        AvailableTime t = times.get(LessonTime.key(first.lessonDate(), first.startTime()));
        Integer price = t == null ? null : t.priceMinor();
        int skaters = t == null ? 2 : Math.max(1, t.shareCount()) + 1;
        Integer share = null;
        if (t != null) {
            List<String> order = new ArrayList<>(t.joinOrder());
            order.add(first.studentId());
            share = PriceShare.of(t.priceMinor(), skaters, order, first.studentId());
        }
        List<InvitationDate> dates = seats.stream().map(s -> new InvitationDate(s.lessonDate(), s.startTime(), s.durationMinutes(),
                s.startsAtUtc(), !Sharing.expired(s.startsAtUtc(), now))).toList();
        // Clashes: the invited dates against the skater's other lessons, with any coach (ADR-025 d5).
        List<Clashes.Slot> mine = seats.stream().map(s -> new Clashes.Slot(s.lessonDate(), s.startTime(), s.durationMinutes(), s.coachId())).toList();
        List<Seat> others = lessons.stream().filter(s -> s.studentId().equals(first.studentId())).toList();
        List<InvitationClash> clashes = new ArrayList<>();
        for (Clashes.Clash c : Clashes.of(mine, others.stream()
                .map(s -> new Clashes.Slot(s.lessonDate(), s.startTime(), s.durationMinutes(), s.coachId())).toList())) {
            String other = account.links().stream().filter(l -> l.coachId().equals(c.other().coachId())).map(SkaterLink::coachFirstName)
                    .findFirst().orElse("");
            clashes.add(new InvitationClash(c.lesson().date(), c.lesson().startTime(), other, c.other().startTime(), c.other().durationMinutes()));
        }
        boolean open = dates.stream().anyMatch(InvitationDate::open);
        return new Invitation(first.share().inviteId(), first.coachId(), link == null ? "" : link.coachFirstName(),
                link == null ? "" : link.coachLastName(), first.studentId(), name, first.share().partnerName(), first.share().invitedByName(),
                seats.size() > 1, dates, price, share, skaters, t == null ? null : t.currency(), open ? "OPEN" : "EXPIRED", clashes);
    }

    /**
     * Go ahead (ADR-MASTER section 8, "The invited family"): after {@code requireActive}, each date that hasn't started joins,
     * each in its own transaction. A skater no longer the coach's student gets the ordinary "no longer available".
     */
    public Answered accept(ClientContext ctx, String inviteId) {
        return answer(ctx, inviteId, true);
    }

    /** Decline: each date still waiting ends {@code DECLINED}; the other family's lesson stays booked, private. */
    public Answered decline(ClientContext ctx, String inviteId) {
        return answer(ctx, inviteId, false);
    }

    private Answered answer(ClientContext ctx, String inviteId, boolean accept) {
        Instant now = clock.instant();
        List<Seat> seats = invitedSeats(ctx, inviteId, now);
        if (seats.isEmpty()) {
            throw DomainException.conflict(GONE);
        }
        Seat first = seats.get(0);
        LinkedSkater skater;
        try {
            skater = links.requireActive(ctx, first.coachId(), first.studentId(), accept ? "accept" : "decline");
        } catch (DomainException e) {
            if (e.reason() == DomainException.Reason.CONFLICT) {
                throw DomainException.conflict(GONE);
            }
            throw e;
        }
        List<LocalDate> done = new ArrayList<>();
        List<LocalDate> skipped = new ArrayList<>();
        for (Seat s : seats) {
            boolean ok = !s.hasStarted(now) && (accept ? shares.accept(ctx, skater, s, now) : shares.decline(ctx, skater, s, now));
            (ok ? done : skipped).add(s.lessonDate());
            if (ok) {
                events.seatsChanged(s.coachId(), s.lessonDate(), s.startTime());
            }
        }
        if (accept && done.isEmpty()) {
            throw DomainException.conflict(GONE);
        }
        return new Answered(skater.studentName(), skater.coachFirstName(), first.share().partnerName(), done, skipped);
    }

    private List<Seat> invitedSeats(ClientContext ctx, String inviteId, Instant now) {
        LocalDate from = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(1);
        return bookings.familySeats(ctx, from, Weeks.storeUntil(from)).stream()
                .filter(s -> s.seatStatus() == Seat.Status.INVITED && inviteId.equals(s.share().inviteId()))
                .sorted(Comparator.comparing(Seat::startsAtUtc)).toList();
    }

    // ------------------------------------------------------------ the inviting family

    /**
     * Withdraw an invitation the other family hasn't answered (ADR-MASTER section 8, "Ending an invitation"): every date of
     * it that's still invited ends {@code WITHDRAWN}. The family's own lessons stay booked, private at the full price.
     */
    public Answered withdraw(ClientContext ctx, String inviteId) {
        Instant now = clock.instant();
        LocalDate from = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(1);
        List<Seat> mine = bookings.familySeats(ctx, from, Weeks.storeUntil(from)).stream()
                .filter(s -> s.seatStatus() == Seat.Status.BOOKED && inviteId.equals(s.share().inviteId())
                        && s.share().invitedStudentId() != null && ctx.clientId().equals(s.clientId()))
                .sorted(Comparator.comparing(Seat::startsAtUtc)).toList();
        if (mine.isEmpty()) {
            throw DomainException.noSuchItem("That invitation couldn’t be found.");
        }
        LinkedSkater host = links.requireActive(ctx, mine.get(0).coachId(), mine.get(0).studentId(), "withdraw");
        List<LocalDate> done = new ArrayList<>();
        List<LocalDate> skipped = new ArrayList<>();
        for (Seat s : mine) {
            boolean ok = !s.hasStarted(now) && shares.withdraw(ctx, host, ShareRepository.invitedSeatOf(s), now);
            (ok ? done : skipped).add(s.lessonDate());
            if (ok) {
                events.seatsChanged(s.coachId(), s.lessonDate(), s.startTime());
            }
        }
        if (done.isEmpty()) {
            throw DomainException.conflict("Their family has already answered, so the invitation can’t be withdrawn.");
        }
        return new Answered(host.studentName(), host.coachFirstName(), mine.get(0).share().partnerName(), done, skipped);
    }

    // --------------------------------------------------------------- the staying family

    /**
     * Keep it private at the full price, for each date given (ADR-MASTER section 8, "The staying family answers"). Each
     * date is its own write, conditional on the lesson's pending leave naming this skater and not being past its answer-by.
     */
    public Answered keep(ClientContext ctx, String coachId, String studentId, LocalTime start, List<LocalDate> dates) {
        LinkedSkater skater = links.requireActive(ctx, coachId, studentId, "keep");
        Instant now = clock.instant();
        List<LocalDate> done = new ArrayList<>();
        List<LocalDate> skipped = new ArrayList<>();
        Map<LocalDate, Seat> mine = new LinkedHashMap<>();
        bookings.familySeats(ctx, dates.stream().min(Comparator.naturalOrder()).orElseThrow(),
                        dates.stream().max(Comparator.naturalOrder()).orElseThrow()).stream()
                .filter(s -> s.coachId().equals(coachId) && s.studentId().equals(studentId) && s.startTime().equals(start))
                .forEach(s -> mine.put(s.lessonDate(), s));
        for (LocalDate d : dates.stream().distinct().sorted().toList()) {
            Seat s = mine.get(d);
            boolean ok = s != null && !s.hasStarted(now) && shares.keep(ctx, skater, s, now);
            (ok ? done : skipped).add(d);
            if (ok) {
                events.seatsChanged(coachId, d, start);
            }
        }
        return new Answered(skater.studentName(), skater.coachFirstName(), null, done, skipped);
    }

    // -------------------------------------------------------------------- freed place

    /**
     * Invite a skater to a freed place (ADR-MASTER section 8, "Freed places"): that one lesson only, the same way as at
     * booking. A sibling the coach has accepted is added directly.
     */
    public Filled fillFreedPlace(ClientContext ctx, String coachId, String studentId, LocalDate date, LocalTime start, String code) {
        LinkedSkater host = links.requireActive(ctx, coachId, studentId, "invite");
        Instant now = clock.instant();
        Seat seat = bookings.familySeats(ctx, date, date).stream()
                .filter(s -> s.coachId().equals(coachId) && s.studentId().equals(studentId) && s.startTime().equals(start))
                .findFirst().orElseThrow(() -> DomainException.noSuchItem("That lesson couldn’t be found. Reload the page."));
        if (!seat.share().freedPlace() || seat.hasStarted(now)) {
            throw DomainException.conflict("This lesson can’t take another skater now. Reload the page.");
        }
        Partners.Resolved r = partners.resolve(ctx, host, code, UUID.randomUUID().toString());
        if (!shares.fillFreedPlace(ctx, host, seat, r.partner(), now)) {
            throw DomainException.conflict("This lesson can’t take another skater now. Reload the page.");
        }
        events.seatsChanged(coachId, date, start);
        return new Filled(r.displayName(), r.sibling());
    }
}
