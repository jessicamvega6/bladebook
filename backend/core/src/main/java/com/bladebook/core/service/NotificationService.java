package com.bladebook.core.service;

import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.NotifyRepository.BatchRow;
import com.bladebook.core.data.NotifyRepository.EndRow;
import com.bladebook.core.data.NotifyRepository.LeaveRow;
import com.bladebook.core.data.NotifyRepository.LineRow;
import com.bladebook.core.data.NotifyRepository.RepriceRow;
import com.bladebook.core.data.NotifyRepository.SeatRow;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.domain.CancellationLine;
import com.bladebook.core.domain.ChangeBatch;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.Email;
import com.bladebook.core.domain.EmailFormat;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.PaymentTypes;
import com.bladebook.core.domain.PriceShare;
import com.bladebook.core.domain.RepriceLine;
import com.bladebook.core.domain.Seat;
import com.bladebook.core.domain.StudentRecord;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * Every email an event sends (ADR-MASTER section 13), each from its stored template (design/harbor/email/templates.mjs)
 * and each behind its guard, so a replay or a second run sends nothing twice. On AWS each method is its own consumer of the
 * table's stream: {@code consumer-booking-confirmation} ({@link #confirmBookings}), {@code consumer-payment-reminder}
 * ({@link #paymentReminder}), {@code consumer-change-notifier} ({@link #changeBatch}), {@code consumer-invite}'s emails
 * ({@link #sharedLesson}, {@link #leaveEmail}) and {@code consumer-student-link}'s decline ({@link #declined}). Locally
 * {@link LocalStreamRouter} calls them after each request (a listed shortcut, SC-20).
 *
 * <p>Guards are claimed before sending and given back if the email isn't accepted, so a failure is tried again on the next
 * run and a success is never sent twice.
 */
public final class NotificationService {

    /** The rink every lesson is at in MVP (ADR-MASTER section 6: rink selection is Phase 2). */
    static final String RINK = "Pelham Civic Center";

    /** Where the buttons go: the family website, the coach website, the rinkside page. Plain links; each page asks to sign in. */
    public record Links(String site) {

        public Links {
            site = site.endsWith("/") ? site.substring(0, site.length() - 1) : site;
        }

        String bookings() { return site + "/family/#/bookings"; }
        String book() { return site + "/family/#/book"; }
        String home() { return site + "/family/#/home"; }
        String invite(String inviteId) { return site + "/family/#/invite/" + inviteId; }
        String calendar() { return site + "/coach/#/calendar"; }
        String lessons() { return site + "/coach/#/lessons"; }
        String payments() { return site + "/coach/#/payments"; }
        String rinkside() { return site + "/coach/rinkside/"; }
    }

    private static final Logger LOG = Logger.getLogger(NotificationService.class.getName());

    private final NotifyRepository repo;
    private final Mailer mailer;
    private final Links links;
    private final Clock clock;

    public NotificationService(NotifyRepository repo, Mailer mailer, Links links, Clock clock) {
        this.repo = repo;
        this.mailer = mailer;
        this.links = links;
        this.clock = clock;
    }

    // ------------------------------------------------------------ booking confirmation

    /**
     * {@code consumer-booking-confirmation}: one email per family for the seats of one coach that are now {@code BOOKED} and
     * not yet confirmed (guard {@code confirmationSent}). A seat that joined through an invitation gets the "joined" email
     * instead ({@link #sharedLesson}).
     *
     * @return emails sent
     */
    public int confirmBookings(String coachId, List<String> seatKeys) {
        Map<String, List<SeatRow>> byFamily = new LinkedHashMap<>();
        for (String key : seatKeys.stream().distinct().toList()) {
            repo.seat(coachId, key).filter(r -> r.seat().seatStatus() == Seat.Status.BOOKED && r.seat().clientId() != null
                            && r.seat().share().invitedByClientId() == null && !r.has(NotifyRepository.CONFIRMATION_SENT))
                    .ifPresent(r -> byFamily.computeIfAbsent(r.seat().clientId(), k -> new ArrayList<>()).add(r));
        }
        if (byFamily.isEmpty()) {
            return 0;
        }
        CoachProfile coach = repo.coach(coachId).orElse(null);
        if (coach == null) {
            return 0;
        }
        int sent = 0;
        String stamp = clock.instant().toString();
        for (Map.Entry<String, List<SeatRow>> e : byFamily.entrySet()) {
            Optional<FamilyProfile> family = repo.family(e.getKey());
            if (family.isEmpty()) {
                continue;
            }
            List<SeatRow> mine = new ArrayList<>();
            for (SeatRow r : e.getValue()) {
                if (repo.claim("COACH#" + coachId, r.seat().key(), NotifyRepository.CONFIRMATION_SENT, stamp)) {
                    mine.add(r);
                }
            }
            if (mine.isEmpty()) {
                continue;
            }
            mine.sort(Comparator.comparing((SeatRow r) -> r.seat().lessonDate()).thenComparing(r -> r.seat().startTime()));
            List<Map<String, Object>> lessons = new ArrayList<>();
            int notice = coach.requiredNoticeHours();
            for (SeatRow r : mine) {
                Seat s = r.seat();
                Optional<LessonTime> t = repo.lesson(coachId, s.lessonDate(), s.startTime());
                List<SeatRow> in = repo.seatsAt(coachId, s.lessonDate(), s.startTime());
                Map<String, Object> l = lessonLine(s, t);
                l.put("price", t.map(x -> EmailFormat.money(share(x, s.studentId(), in), x.currency())).orElse(""));
                sharedWith(s, in).ifPresent(w -> l.put("sharedWith", w));
                lessons.add(l);
                notice = t.map(LessonTime::requiredNoticeHours).orElse(notice);
            }
            List<String> skaters = mine.stream().map(r -> EmailFormat.first(r.seat().studentName())).distinct().toList();
            Seat first = mine.get(0).seat();
            Map<String, Object> d = familyData(coach, family.get());
            d.put("oneLesson", mine.size() == 1);
            d.put("plural", skaters.size() > 1);
            d.put("skaterNames", EmailFormat.and(skaters));
            d.put("lessonCount", Integer.toString(mine.size()));
            d.put("firstDate", EmailFormat.date(first.lessonDate()));
            d.put("firstTime", EmailFormat.time(first.startTime()));
            d.put("rink", RINK);
            boolean repeats = mine.stream().anyMatch(r -> r.seat().recurrenceId() != null);
            d.put("repeats", repeats);
            if (repeats) {
                d.put("repeatsUntil", EmailFormat.date(mine.get(mine.size() - 1).seat().lessonDate()));
            }
            d.put("noticeHours", Integer.toString(notice));
            d.put("lessons", lessons);
            List<SeatRow> claimed = mine;
            if (send(Email.toFamily("booking-confirmation", family.get().email(), coach, d),
                    () -> claimed.forEach(r -> repo.release("COACH#" + coachId, r.seat().key(), NotifyRepository.CONFIRMATION_SENT, stamp)))) {
                sent++;
            }
        }
        return sent;
    }

    // --------------------------------------------------------------- payment reminder

    /**
     * {@code consumer-payment-reminder}, on {@code CheckInRecorded}: the seat's amount (its share) and how to pay the coach.
     * One per lesson (guard {@code paymentReminderSent}); none once the lesson is already paid or waived.
     */
    public boolean paymentReminder(String coachId, String seatKey) {
        Optional<SeatRow> row = repo.seat(coachId, seatKey);
        if (row.isEmpty() || row.get().seat().seatStatus() != Seat.Status.CHECKED_IN || row.get().seat().clientId() == null
                || row.get().has(NotifyRepository.PAYMENT_REMINDER_SENT) || !"UNPAID".equals(row.get().paymentStatus())) {
            return false;
        }
        Seat s = row.get().seat();
        CoachProfile coach = repo.coach(coachId).orElse(null);
        FamilyProfile family = repo.family(s.clientId()).orElse(null);
        Optional<LessonTime> t = repo.lesson(coachId, s.lessonDate(), s.startTime());
        if (coach == null || family == null || t.isEmpty()) {
            return false;
        }
        String stamp = clock.instant().toString();
        if (!repo.claim("COACH#" + coachId, seatKey, NotifyRepository.PAYMENT_REMINDER_SENT, stamp)) {
            return false;
        }
        List<SeatRow> in = repo.seatsAt(coachId, s.lessonDate(), s.startTime());
        Map<String, Object> d = familyData(coach, family);
        d.put("skater", EmailFormat.first(s.studentName()));
        d.put("date", EmailFormat.date(s.lessonDate()));
        d.put("time", EmailFormat.time(s.startTime()));
        d.put("amount", EmailFormat.money(share(t.get(), s.studentId(), in), t.get().currency()));
        d.put("shared", sharedWith(s, in).isPresent());
        d.put("instructionLines", EmailFormat.lines(coach.paymentInstructions()).stream().map(l -> Map.of("line", l)).toList());
        List<Map<String, Object>> methods = new ArrayList<>();
        for (PaymentTypes.Type type : PaymentTypes.Type.values()) {
            if (coach.payments().isOn(type)) {
                methods.add(Map.of("label", type.label(), "handle", type.hasHandle() ? coach.payments().handle(type).orElse("") : "At the rink"));
            }
        }
        d.put("methods", methods);
        return send(Email.toFamily("payment-reminder", family.email(), coach, d),
                () -> repo.release("COACH#" + coachId, seatKey, NotifyRepository.PAYMENT_REMINDER_SENT, stamp));
    }

    // --------------------------------------------------------------- change notifier

    /**
     * {@code consumer-change-notifier}, once a batch header is {@code EXECUTED} (ADR-MASTER section 13, routing by actor):
     * <ul>
     *   <li>{@code COACH}: each family, "lesson cancelled by the coach";</li>
     *   <li>{@code SCHEDULE_CHANGE}: each family, "schedule change" with its cancelled and re-priced lessons; and the coach,
     *       for lines skipped because the lesson passed first;</li>
     *   <li>{@code CLIENT}: the coach, for each lesson cancelled inside the notice period; the staying family's "Cancel, no
     *       charge" instead emails that family the dates, and not the coach;</li>
     *   <li>{@code NO_ANSWER}: the staying family, "cancelled, no answer".</li>
     * </ul>
     * Lines are stamped {@code SENT} (or {@code FAILED}) per recipient; a recipient whose lines are all {@code SENT} is
     * skipped on a retry; {@code SKIPPED} lines aren't notified, except the coach's lesson-passed list.
     *
     * @return emails sent
     */
    public int changeBatch(String coachId, String batchSk) {
        Optional<BatchRow> found = repo.batch(coachId, batchSk);
        if (found.isEmpty() || found.get().batch().executionStatus() != ChangeBatch.Execution.EXECUTED) {
            return 0;
        }
        CoachProfile coach = repo.coach(coachId).orElse(null);
        if (coach == null) {
            return 0;
        }
        BatchRow b = found.get();
        List<LineRow> done = b.lines().stream().filter(l -> l.line().executionStatus() == ChangeBatch.Execution.EXECUTED).toList();
        List<RepriceRow> repriced = b.reprices().stream().filter(r -> r.line().executionStatus() == ChangeBatch.Execution.EXECUTED).toList();
        int sent = 0;
        switch (b.batch().cancelledBy()) {
            case COACH:
                for (Map.Entry<String, List<LineRow>> e : byFamily(done).entrySet()) {
                    sent += perFamily(coachId, coach, e.getKey(), e.getValue(), List.of(), d -> coachCancelled(d, coach, e.getValue()),
                            "lesson-cancelled-by-coach");
                }
                break;
            case SCHEDULE_CHANGE: {
                Map<String, List<LineRow>> cancels = byFamily(done);
                Map<String, List<RepriceRow>> reprices = repriced.stream()
                        .collect(Collectors.groupingBy(r -> r.line().clientId(), LinkedHashMap::new, Collectors.toList()));
                List<String> families = new ArrayList<>(cancels.keySet());
                reprices.keySet().stream().filter(f -> !families.contains(f)).forEach(families::add);
                for (String f : families) {
                    List<LineRow> c = cancels.getOrDefault(f, List.of());
                    List<RepriceRow> r = reprices.getOrDefault(f, List.of());
                    sent += perFamily(coachId, coach, f, c, r, d -> scheduleChanged(d, c, r), "schedule-change");
                }
                List<LineRow> passed = b.lines().stream().filter(l -> l.line().executionStatus() == ChangeBatch.Execution.SKIPPED
                        && "LESSON_PASSED".equals(l.skippedReason())).toList();
                if (!passed.isEmpty() && !allSent(passed, List.of())) {
                    sent += toCoach(coachId, coach, passed, "coach-lessons-passed", d -> lessonsPassed(d, passed));
                }
                break;
            }
            case CLIENT:
                if (ChangeBatch.STAYING_CANCEL.equals(b.batch().notes().get("kind"))) {
                    for (Map.Entry<String, List<LineRow>> e : byFamily(done).entrySet()) {
                        sent += perFamily(coachId, coach, e.getKey(), e.getValue(), List.of(), d -> datesCancelled(d, e.getValue()),
                                "share-dates-cancelled");
                    }
                } else {
                    for (LineRow late : done.stream().filter(l -> l.line().noticeHours() < coach.requiredNoticeHours()).toList()) {
                        if (!allSent(List.of(late), List.of())) {
                            sent += toCoach(coachId, coach, List.of(late), "coach-late-cancellation", d -> lateCancel(d, coach, late.line()));
                        }
                    }
                }
                break;
            case NO_ANSWER:
                for (Map.Entry<String, List<LineRow>> e : byFamily(done).entrySet()) {
                    sent += perFamily(coachId, coach, e.getKey(), e.getValue(), List.of(),
                            d -> noAnswer(d, coach, e.getValue().get(0).line(), b.batch().notes()), "share-cancelled-no-answer");
                }
                break;
            default:
                break;
        }
        return sent;
    }

    private Map<String, List<LineRow>> byFamily(List<LineRow> lines) {
        return lines.stream().filter(l -> l.line().clientId() != null)
                .collect(Collectors.groupingBy(l -> l.line().clientId(), LinkedHashMap::new, Collectors.toList()));
    }

    private static boolean allSent(List<LineRow> lines, List<RepriceRow> reprices) {
        return lines.stream().allMatch(l -> "SENT".equals(l.notificationStatus()))
                && reprices.stream().allMatch(r -> "SENT".equals(r.notificationStatus()));
    }

    private int perFamily(String coachId, CoachProfile coach, String clientId, List<LineRow> lines, List<RepriceRow> reprices,
                          Consumer<Map<String, Object>> fill, String template) {
        if (allSent(lines, reprices)) {
            return 0;
        }
        Optional<FamilyProfile> family = repo.family(clientId);
        if (family.isEmpty()) {
            return 0;
        }
        Map<String, Object> d = familyData(coach, family.get());
        fill.accept(d);
        List<String> sks = new ArrayList<>();
        lines.forEach(l -> sks.add(l.sk()));
        reprices.forEach(r -> sks.add(r.sk()));
        return stamped(coachId, sks, Email.toFamily(template, family.get().email(), coach, d)) ? 1 : 0;
    }

    private int toCoach(String coachId, CoachProfile coach, List<LineRow> lines, String template, Consumer<Map<String, Object>> fill) {
        Map<String, Object> d = coachData(coach);
        fill.accept(d);
        return stamped(coachId, lines.stream().map(LineRow::sk).toList(), Email.toCoach(template, coach, d)) ? 1 : 0;
    }

    /** Sends, then stamps the lines {@code SENT}; on a refusal, {@code FAILED} with the reason, and the next run retries. */
    private boolean stamped(String coachId, List<String> sks, Email email) {
        try {
            mailer.send(email);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "email not accepted: " + email.template(), e);
            repo.markLines(coachId, sks, "FAILED", e.getClass().getSimpleName(), clock.instant());
            return false;
        }
        repo.markLines(coachId, sks, "SENT", null, clock.instant());
        return true;
    }

    private void coachCancelled(Map<String, Object> d, CoachProfile coach, List<LineRow> lines) {
        List<CancellationLine> ls = sorted(lines);
        List<String> skaters = ls.stream().map(l -> EmailFormat.first(l.studentName())).distinct().toList();
        d.put("oneLesson", ls.size() == 1);
        d.put("skaterNames", EmailFormat.and(skaters));
        d.put("firstDate", EmailFormat.date(ls.get(0).lessonDate()));
        d.put("lessonCount", Integer.toString(ls.size()));
        d.put("lessons", ls.stream().map(l -> (Object) Map.of("date", EmailFormat.date(l.lessonDate()), "time", EmailFormat.time(l.startTime()),
                "skater", EmailFormat.first(l.studentName()), "rink", RINK)).toList());
    }

    private void scheduleChanged(Map<String, Object> d, List<LineRow> cancels, List<RepriceRow> reprices) {
        d.put("cancelled", sorted(cancels).stream().map(l -> (Object) Map.of("date", EmailFormat.date(l.lessonDate()),
                "time", EmailFormat.time(l.startTime()), "skater", EmailFormat.first(l.studentName()))).toList());
        List<RepriceLine> rs = reprices.stream().map(RepriceRow::line)
                .sorted(Comparator.comparing(RepriceLine::lessonDate).thenComparing(RepriceLine::startTime)).toList();
        List<Object> down = new ArrayList<>();
        List<Object> up = new ArrayList<>();
        for (RepriceLine r : rs) {
            Map<String, Object> m = Map.of("date", EmailFormat.date(r.lessonDate()), "time", EmailFormat.time(r.startTime()),
                    "skater", EmailFormat.first(r.studentName()), "oldPrice", EmailFormat.money(r.oldPriceMinor(), r.currency()),
                    "newPrice", EmailFormat.money(r.newPriceMinor(), r.currency()));
            (r.newPriceMinor() < r.oldPriceMinor() ? down : up).add(m);
        }
        d.put("priceDown", down);
        d.put("priceDownSummary", down.isEmpty() ? "" : down.size() == 1 ? "a lesson costs less" : down.size() + " lessons cost less");
        d.put("priceUp", up);
    }

    private void lessonsPassed(Map<String, Object> d, List<LineRow> lines) {
        List<CancellationLine> ls = sorted(lines);
        d.put("lessonCount", Integer.toString(ls.size()));
        d.put("lessons", ls.stream().map(l -> (Object) Map.of("date", EmailFormat.date(l.lessonDate()), "time", EmailFormat.time(l.startTime()),
                "skater", l.studentName(), "familyName", repo.family(l.clientId()).map(FamilyProfile::fullName).orElse(""))).toList());
    }

    private void datesCancelled(Map<String, Object> d, List<LineRow> lines) {
        List<CancellationLine> ls = sorted(lines);
        d.put("skater", EmailFormat.first(ls.get(0).studentName()));
        d.put("lessonCount", Integer.toString(ls.size()));
        d.put("lessons", ls.stream().map(l -> (Object) Map.of("date", EmailFormat.date(l.lessonDate()), "time", EmailFormat.time(l.startTime()),
                "rink", RINK)).toList());
    }

    private void lateCancel(Map<String, Object> d, CoachProfile coach, CancellationLine l) {
        FamilyProfile family = repo.family(l.clientId()).orElse(null);
        d.put("familyName", family == null ? "A family" : family.fullName());
        d.put("skater", l.studentName());
        d.put("date", EmailFormat.date(l.lessonDate()));
        d.put("time", EmailFormat.time(l.startTime()));
        d.put("rink", RINK);
        d.put("cancelledAt", EmailFormat.dateTime(l.cancelledAt(), coach.coachTimezone()));
        d.put("noticeHours", Integer.toString(coach.requiredNoticeHours()));
        // Who keeps the lesson: the other skater still in it, if any (a late leave keeps their share, ADR-MASTER section 8).
        String other = repo.seatsAt(coach.coachId(), l.lessonDate(), l.startTime()).stream()
                .filter(r -> r.seat().seatStatus() != Seat.Status.INVITED && !r.seat().studentId().equals(l.studentId()))
                .map(r -> r.seat().studentName()).findFirst().orElse("");
        d.put("sharedWith", other);
    }

    private void noAnswer(Map<String, Object> d, CoachProfile coach, CancellationLine l, Map<String, String> notes) {
        d.put("skater", EmailFormat.first(l.studentName()));
        d.put("otherSkater", notes.getOrDefault("otherSkater", "the other skater"));
        d.put("date", EmailFormat.date(l.lessonDate()));
        d.put("time", EmailFormat.time(l.startTime()));
        d.put("answerBy", notes.containsKey("answerBy") ? EmailFormat.dateTime(Instant.parse(notes.get("answerBy")), coach.coachTimezone()) : "");
    }

    private static List<CancellationLine> sorted(List<LineRow> lines) {
        return lines.stream().map(LineRow::line)
                .sorted(Comparator.comparing(CancellationLine::lessonDate).thenComparing(CancellationLine::startTime)).toList();
    }

    // ------------------------------------------------------------- shared lessons

    /**
     * {@code consumer-invite}'s emails for one lesson time (ADR-MASTER section 8, "Who sends what"): the invitation, once the
     * invited family is known; "joined" to both families; "declined" to the inviting family; "withdrawn" and "no longer
     * available" to the invited family; and "the other skater can't make it" to the staying family ({@link #leaveEmail}).
     * Each has its guard on the record it's about. An invitation ended by the coach's cancel has no record and no email
     * (S11).
     *
     * @return emails sent
     */
    public int sharedLesson(String coachId, LocalDate date, LocalTime start) {
        List<SeatRow> seats = repo.seatsAt(coachId, date, start);
        List<EndRow> endings = repo.endings(coachId, date, start).stream().filter(e -> !e.emailed()).toList();
        boolean invites = seats.stream().anyMatch(r -> r.seat().seatStatus() == Seat.Status.INVITED && !r.has(NotifyRepository.INVITE_EMAIL_SENT));
        boolean joins = seats.stream().anyMatch(r -> joined(r) && !r.has(NotifyRepository.JOINED_EMAIL_SENT));
        int sent = 0;
        if (invites || joins || !endings.isEmpty()) {
            CoachProfile coach = repo.coach(coachId).orElse(null);
            Optional<LessonTime> t = repo.lesson(coachId, date, start);
            if (coach == null) {
                return 0;
            }
            for (SeatRow r : seats) {
                if (r.seat().seatStatus() == Seat.Status.INVITED && r.seat().share().invitedClientId() != null
                        && !r.has(NotifyRepository.INVITE_EMAIL_SENT) && t.isPresent() && t.get().startsAtUtc().isAfter(clock.instant())) {
                    sent += invitation(coach, t.get(), r.seat(), seats) ? 1 : 0;
                }
                if (joined(r) && !r.has(NotifyRepository.JOINED_EMAIL_SENT) && t.isPresent()) {
                    sent += joinedEmails(coach, t.get(), r.seat(), seats);
                }
            }
            for (EndRow e : endings) {
                sent += ended(coach, t.orElse(null), e, seats, date, start) ? 1 : 0;
            }
        }
        return sent + (leaveEmail(coachId, date, start) ? 1 : 0);
    }

    /** A seat that came from an invitation and has since joined. */
    private static boolean joined(SeatRow r) {
        return r.seat().seatStatus() != Seat.Status.INVITED && r.seat().share().invitedByClientId() != null;
    }

    private boolean invitation(CoachProfile coach, LessonTime t, Seat invited, List<SeatRow> seats) {
        FamilyProfile family = repo.family(invited.share().invitedClientId()).orElse(null);
        if (family == null) {
            return false;
        }
        String stamp = clock.instant().toString();
        if (!repo.claim("COACH#" + coach.coachId(), invited.key(), NotifyRepository.INVITE_EMAIL_SENT, stamp)) {
            return false;
        }
        Seat host = host(invited, seats);
        List<String> order = new ArrayList<>(booked(seats));
        order.add(invited.studentId());
        Map<String, Object> d = familyData(coach, family);
        d.put("inviterName", Objects.requireNonNullElse(invited.share().invitedByName(), "Another family"));
        d.put("inviterSkater", host == null ? "their skater" : EmailFormat.first(host.studentName()));
        d.put("skater", EmailFormat.first(invited.studentName()));
        d.put("date", EmailFormat.date(t.lessonDate()));
        d.put("time", EmailFormat.time(t.startTime()));
        d.put("rink", RINK);
        d.put("length", EmailFormat.length(t.durationMinutes()));
        d.put("share", EmailFormat.money(PriceShare.of(t.priceMinor(), order.size(), order, invited.studentId()), t.currency()));
        d.put("fullPrice", EmailFormat.money(t.priceMinor(), t.currency()));
        d.put("invitationUrl", links.invite(invited.share().inviteId()));
        return send(Email.toFamily("share-invitation", family.email(), coach, d),
                () -> repo.release("COACH#" + coach.coachId(), invited.key(), NotifyRepository.INVITE_EMAIL_SENT, stamp));
    }

    /** "Joined": the same template to each family, worded by {@code isInviter}. */
    private int joinedEmails(CoachProfile coach, LessonTime t, Seat joiner, List<SeatRow> seats) {
        String stamp = clock.instant().toString();
        if (!repo.claim("COACH#" + coach.coachId(), joiner.key(), NotifyRepository.JOINED_EMAIL_SENT, stamp)) {
            return 0;
        }
        Seat host = host(joiner, seats);
        int sent = 0;
        FamilyProfile joinerFamily = repo.family(joiner.clientId()).orElse(null);
        FamilyProfile hostFamily = host == null || host.clientId() == null ? null : repo.family(host.clientId()).orElse(null);
        if (joinerFamily != null && host != null) {
            sent += send(Email.toFamily("share-joined", joinerFamily.email(), coach,
                    joinedData(coach, joinerFamily, t, joiner, host, false, hostFamily, seats)), () -> { }) ? 1 : 0;
        }
        if (hostFamily != null) {
            sent += send(Email.toFamily("share-joined", hostFamily.email(), coach,
                    joinedData(coach, hostFamily, t, host, joiner, true, joinerFamily, seats)), () -> { }) ? 1 : 0;
        }
        return sent;
    }

    private Map<String, Object> joinedData(CoachProfile coach, FamilyProfile to, LessonTime t, Seat mine, Seat other, boolean isInviter,
                                           FamilyProfile otherFamily, List<SeatRow> seats) {
        Map<String, Object> d = familyData(coach, to);
        d.put("isInviter", isInviter);
        d.put("otherFamily", otherFamily == null ? "The other family" : otherFamily.fullName());
        d.put("skater", EmailFormat.first(mine.studentName()));
        d.put("otherSkater", EmailFormat.first(other.studentName()));
        d.put("date", EmailFormat.date(t.lessonDate()));
        d.put("time", EmailFormat.time(t.startTime()));
        d.put("rink", RINK);
        d.put("share", EmailFormat.money(share(t, mine.studentId(), seats), t.currency()));
        d.put("fullPrice", EmailFormat.money(t.priceMinor(), t.currency()));
        d.put("noticeHours", Integer.toString(t.requiredNoticeHours()));
        return d;
    }

    private boolean ended(CoachProfile coach, LessonTime t, EndRow e, List<SeatRow> seats, LocalDate date, LocalTime start) {
        // The invited family, when the ending doesn't name them (the inviting family's withdrawal can't read the invited
        // seat): from the coach's record of the skater, as consumer-invite finds them.
        String invited = e.clientId() != null ? e.clientId()
                : repo.student(coach.coachId(), e.studentId()).map(StudentRecord::clientId).orElse(null);
        String to = switch (e.outcome()) {
            case DECLINED -> e.invitedByClientId();
            case WITHDRAWN, EXPIRED -> invited;
        };
        String pk = "COACH#" + coach.coachId();
        if (!repo.claim(pk, e.sk(), "emailSent", "true")) {
            return false;
        }
        FamilyProfile family = to == null ? null : repo.family(to).orElse(null);
        if (family == null) {
            return false; // nobody to tell: the invited family never saw it, or the inviter is gone
        }
        Seat host = seats.stream().map(SeatRow::seat).filter(s -> e.studentId().equals(s.share().invitedStudentId()))
                .findFirst().orElse(seats.stream().map(SeatRow::seat).filter(s -> s.seatStatus() != Seat.Status.INVITED).findFirst().orElse(null));
        Map<String, Object> d = familyData(coach, family);
        d.put("date", EmailFormat.date(date));
        d.put("time", EmailFormat.time(start));
        String template;
        if (e.outcome() == ShareRepository.Ended.DECLINED) {
            template = "share-invitation-declined";
            d.put("inviteeName", e.clientId() == null ? "The other family" : repo.family(e.clientId()).map(FamilyProfile::fullName).orElse("The other family"));
            d.put("inviteeSkater", EmailFormat.first(e.studentName()));
            d.put("skater", host == null ? "your skater" : EmailFormat.first(host.studentName()));
            d.put("rink", RINK);
            d.put("price", t == null ? "" : EmailFormat.money(t.priceMinor(), t.currency()));
        } else {
            template = e.outcome() == ShareRepository.Ended.WITHDRAWN ? "share-invitation-withdrawn" : "share-no-longer-available";
            d.put("inviterName", e.invitedByClientId() == null ? "The other family"
                    : repo.family(e.invitedByClientId()).map(FamilyProfile::fullName).orElse("The other family"));
            d.put("skater", EmailFormat.first(e.studentName()));
        }
        return send(Email.toFamily(template, family.email(), coach, d), () -> repo.release(pk, e.sk(), "emailSent", "true"));
    }

    /**
     * "The other skater can't make it — keep or cancel", to the staying family, once per pending leave (its guard is on the
     * leave itself). Always sent (ADR-MASTER section 8).
     */
    public boolean leaveEmail(String coachId, LocalDate date, LocalTime start) {
        Optional<LeaveRow> pending = repo.pendingLeave(coachId, date, start);
        if (pending.isEmpty() || pending.get().emailed()) {
            return false;
        }
        ShareRepository.PendingLeave p = pending.get().leave();
        Optional<SeatRow> staying = repo.seat(coachId, Seat.key(date, start, p.stayingStudentId()));
        Optional<LessonTime> t = repo.lesson(coachId, date, start);
        CoachProfile coach = repo.coach(coachId).orElse(null);
        if (staying.isEmpty() || staying.get().seat().clientId() == null || t.isEmpty() || coach == null) {
            return false;
        }
        FamilyProfile family = repo.family(staying.get().seat().clientId()).orElse(null);
        if (family == null || !repo.claimLeaveEmail(coachId, date, start, p.leaveId(), true)) {
            return false;
        }
        Seat s = staying.get().seat();
        List<String> order = t.get().joinOrder().isEmpty() ? List.of(s.studentId(), p.leftStudentId()) : t.get().joinOrder();
        Map<String, Object> d = familyData(coach, family);
        d.put("skater", EmailFormat.first(s.studentName()));
        d.put("otherSkater", p.leftStudentName());
        d.put("date", EmailFormat.date(date));
        d.put("time", EmailFormat.time(start));
        d.put("rink", RINK);
        d.put("fullPrice", EmailFormat.money(t.get().priceMinor(), t.get().currency()));
        d.put("share", EmailFormat.money(PriceShare.of(t.get().priceMinor(), Math.max(t.get().shareCount(), order.size()), order,
                s.studentId()), t.get().currency()));
        d.put("answerBy", EmailFormat.dateTime(p.answerBy(), coach.coachTimezone()));
        return send(Email.toFamily("share-other-cant-make-it", family.email(), coach, d),
                () -> repo.claimLeaveEmail(coachId, date, start, p.leaveId(), false));
    }

    // ------------------------------------------------------------------- decline

    /**
     * {@code consumer-student-link}, a {@code PENDING} skater declined: "your sign-up wasn't accepted", to the family's email
     * on the coach's record (SC-9's designed wording, ADR-002 d2b). No guard: the record is gone, and the consumer runs
     * once per removal.
     */
    public boolean declined(StudentRecord before) {
        CoachProfile coach = repo.coach(before.coachId()).orElse(null);
        if (coach == null || before.clientEmail() == null) {
            return false;
        }
        Map<String, Object> d = new HashMap<>();
        d.put("coachName", coach.firstName() + " " + coach.lastName());
        d.put("coachFirst", coach.firstName());
        d.put("coachBusinessEmail", replyTo(coach));
        d.put("familyFirst", repo.family(before.clientId()).map(FamilyProfile::firstName).orElse(EmailFormat.first(before.clientName())));
        d.put("skater", EmailFormat.first(before.studentName()));
        return send(Email.toFamily("signup-declined", before.clientEmail(), coach, d), () -> { });
    }

    // -------------------------------------------------------------------- helpers

    /** The template data every family email shares. */
    Map<String, Object> familyData(CoachProfile coach, FamilyProfile family) {
        Map<String, Object> d = new HashMap<>();
        d.put("coachName", coach.firstName() + " " + coach.lastName());
        d.put("coachFirst", coach.firstName());
        d.put("coachInitials", coach.initials());
        d.put("coachBusinessEmail", replyTo(coach));
        d.put("familyFirst", family.firstName());
        d.put("noticeHours", Integer.toString(coach.requiredNoticeHours()));
        d.put("myBookingsUrl", links.bookings());
        d.put("bookUrl", links.book());
        d.put("homeUrl", links.home());
        return d;
    }

    /** The template data every coach email shares. */
    Map<String, Object> coachData(CoachProfile coach) {
        Map<String, Object> d = new HashMap<>();
        d.put("coachFirst", coach.firstName());
        d.put("rinksideUrl", links.rinkside());
        d.put("calendarUrl", links.calendar());
        d.put("lessonsUrl", links.lessons());
        d.put("paymentsUrl", links.payments());
        return d;
    }

    private static String replyTo(CoachProfile coach) {
        return coach.businessEmail() != null ? coach.businessEmail() : coach.loginEmail();
    }

    private static Map<String, Object> lessonLine(Seat s, Optional<LessonTime> t) {
        Map<String, Object> l = new HashMap<>();
        l.put("date", EmailFormat.date(s.lessonDate()));
        l.put("time", EmailFormat.time(s.startTime()));
        l.put("skater", EmailFormat.first(s.studentName()));
        l.put("length", EmailFormat.length(t.map(LessonTime::durationMinutes).orElse(s.durationMinutes())));
        l.put("rink", RINK);
        return l;
    }

    /** The seats that count for the price, in the order they joined. */
    static List<String> booked(List<SeatRow> seats) {
        return seats.stream().map(SeatRow::seat).filter(s -> s.seatStatus() != Seat.Status.INVITED)
                .sorted(Comparator.comparing(Seat::joinedAt)).map(Seat::studentId).toList();
    }

    /** A skater's share of the lesson's price (ADR-MASTER section 8, "Price shares"). */
    static int share(LessonTime t, String studentId, List<SeatRow> seats) {
        return t.shareFor(t.priceMinor(), studentId, booked(seats));
    }

    /** The other skater in the lesson, by display name, if it's shared. */
    private static Optional<String> sharedWith(Seat s, List<SeatRow> seats) {
        return seats.stream().map(SeatRow::seat).filter(o -> o.seatStatus() != Seat.Status.INVITED && !o.studentId().equals(s.studentId()))
                .map(Seat::studentName).findFirst();
    }

    /** The inviting family's seat for an invited (or joined) seat. */
    private static Seat host(Seat invited, List<SeatRow> seats) {
        return seats.stream().map(SeatRow::seat).filter(s -> invited.studentId().equals(s.share().invitedStudentId())).findFirst()
                .orElse(seats.stream().map(SeatRow::seat).filter(s -> !s.studentId().equals(invited.studentId())
                        && s.seatStatus() != Seat.Status.INVITED && invited.share().invitedByClientId() != null
                        && invited.share().invitedByClientId().equals(s.clientId())).findFirst().orElse(null));
    }

    /** Sends; on a refusal, runs {@code undo} (gives the guard back) and reports {@code false}. */
    private boolean send(Email email, Runnable undo) {
        try {
            mailer.send(email);
            return true;
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "email not accepted: " + email.template(), e);
            undo.run();
            return false;
        }
    }
}
