package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.NotifyRepository.SeatRow;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.Email;
import com.bladebook.core.domain.EmailFormat;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.Seat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * The scheduled jobs that send email, and the nightly roller (ADR-MASTER section 14). Each takes the date it is for, as the
 * Scheduler's trigger carries it, and never reads the clock for it, so a re-run works on that date. On AWS each is its own
 * function on an EventBridge Scheduler rule; locally a timer and a local-only route call them (a listed shortcut, SC-22).
 */
public final class ScheduledJobs {

    /** What {@code sched-day-reminder} did. */
    public record DayOf(int reminders, int morningEmails) {
    }

    /** What {@code sched-unpaid-reminder} did. */
    public record Unpaid(int emails, int lessons) {
    }

    /** What {@code sched-lesson-roller} did. */
    public record Rolled(int coaches, int added) {
    }

    private static final Logger LOG = Logger.getLogger(ScheduledJobs.class.getName());

    private final NotifyRepository repo;
    private final NotificationService notifications;
    private final ScheduleChangeService schedules;
    private final Mailer mailer;
    /** {@code null}: no threshold set, so the unpaid reminder sends nothing (ADR-MASTER section 12). */
    private final Integer unpaidThresholdDays;

    public ScheduledJobs(NotifyRepository repo, NotificationService notifications, ScheduleChangeService schedules, Mailer mailer,
                         Integer unpaidThresholdDays) {
        this.repo = repo;
        this.notifications = notifications;
        this.schedules = schedules;
        this.mailer = mailer;
        this.unpaidThresholdDays = unpaidThresholdDays;
    }

    // ------------------------------------------------------------ sched-day-reminder

    /**
     * ~7:00am: one day-of reminder per family per coach, listing each of that family's lessons with the coach on
     * {@code date} (owner, 2026-11-13, G-37: one per family per day, replacing one per lesson per skater; per coach because
     * each family email carries its own coach's Reply-To), and the coach's morning email listing that day's lessons with
     * the rinkside link (guard {@code morningEmailSentOn} on the profile). Only {@code BOOKED}, {@code CHECKED_IN} and
     * {@code NO_SHOW} seats, which are the ones on GSI2.
     *
     * <p>The guard stays {@code remindedOn} on each seat: every seat in the email is claimed before it's sent and all are
     * given back if it isn't accepted, so a re-run sends nothing twice and a failed email is sent whole next time.
     */
    public DayOf dayOf(LocalDate date) {
        List<SeatRow> seats = repo.seatsOn(date).stream()
                .filter(r -> r.seat().seatStatus() != Seat.Status.INVITED && r.seat().clientId() != null)
                .sorted(Comparator.comparing((SeatRow r) -> r.seat().coachId()).thenComparing(r -> r.seat().startTime()))
                .toList();
        Map<String, List<SeatRow>> byCoach = seats.stream()
                .collect(Collectors.groupingBy(r -> r.seat().coachId(), LinkedHashMap::new, Collectors.toList()));
        int reminders = 0;
        int mornings = 0;
        for (Map.Entry<String, List<SeatRow>> e : byCoach.entrySet()) {
            CoachProfile coach = repo.coach(e.getKey()).orElse(null);
            if (coach == null) {
                continue;
            }
            Map<String, List<SeatRow>> byFamily = e.getValue().stream()
                    .collect(Collectors.groupingBy(r -> r.seat().clientId(), LinkedHashMap::new, Collectors.toList()));
            for (List<SeatRow> family : byFamily.values()) {
                reminders += reminder(coach, family, e.getValue(), date) ? 1 : 0;
            }
            mornings += morning(coach, e.getValue(), date) ? 1 : 0;
        }
        return new DayOf(reminders, mornings);
    }

    private boolean reminder(CoachProfile coach, List<SeatRow> mine, List<SeatRow> sameDay, LocalDate date) {
        FamilyProfile family = repo.family(mine.get(0).seat().clientId()).orElse(null);
        if (family == null) {
            return false;
        }
        String pk = "COACH#" + coach.coachId();
        List<Seat> claimed = new ArrayList<>();
        for (SeatRow r : mine) {
            if (!date.toString().equals(r.guard(NotifyRepository.REMINDED_ON))
                    && repo.claim(pk, r.seat().key(), NotifyRepository.REMINDED_ON, date.toString())) {
                claimed.add(r.seat());
            }
        }
        if (claimed.isEmpty()) {
            return false;
        }
        List<Map<String, Object>> lessons = new ArrayList<>();
        for (Seat s : claimed) {
            Map<String, Object> lesson = new LinkedHashMap<>();
            lesson.put("time", EmailFormat.time(s.startTime()));
            lesson.put("skater", EmailFormat.first(s.studentName()));
            lesson.put("length", EmailFormat.length(s.durationMinutes()));
            lesson.put("rink", NotificationService.RINK);
            sameDay.stream().map(SeatRow::seat).filter(o -> o.startTime().equals(s.startTime()) && !o.studentId().equals(s.studentId()))
                    .map(Seat::studentName).findFirst().ifPresent(w -> lesson.put("sharedWith", w));
            lessons.add(lesson);
        }
        List<String> skaters = claimed.stream().map(s -> EmailFormat.first(s.studentName())).distinct().toList();
        Seat first = claimed.get(0);
        Map<String, Object> d = notifications.familyData(coach, family);
        d.put("skaterNames", EmailFormat.and(skaters));
        d.put("plural", skaters.size() > 1);
        d.put("firstTime", EmailFormat.time(first.startTime()));
        d.put("rink", NotificationService.RINK);
        d.put("lessons", lessons);
        repo.lesson(coach.coachId(), first.lessonDate(), first.startTime())
                .ifPresent(t -> d.put("noticeHours", Integer.toString(t.requiredNoticeHours())));
        return send(Email.toFamily("day-of-reminder", family.email(), coach, d),
                () -> claimed.forEach(s -> repo.release(pk, s.key(), NotifyRepository.REMINDED_ON, date.toString())));
    }

    private boolean morning(CoachProfile coach, List<SeatRow> seats, LocalDate date) {
        String pk = "COACH#" + coach.coachId();
        if (!repo.claim(pk, "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, date.toString())) {
            return false;
        }
        Map<LocalTime, List<Seat>> byTime = new TreeMap<>();
        seats.forEach(r -> byTime.computeIfAbsent(r.seat().startTime(), k -> new ArrayList<>()).add(r.seat()));
        List<Map<String, Object>> lessons = new ArrayList<>();
        byTime.forEach((start, in) -> {
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("time", EmailFormat.time(start));
            l.put("skaters", in.stream().sorted(Comparator.comparing(Seat::joinedAt)).map(Seat::studentName).collect(Collectors.joining(" & ")));
            l.put("length", EmailFormat.length(in.get(0).durationMinutes()));
            l.put("rink", NotificationService.RINK);
            l.put("shared", in.size() > 1);
            lessons.add(l);
        });
        Map<String, Object> d = notifications.coachData(coach);
        d.put("today", EmailFormat.date(date));
        d.put("lessonCount", Integer.toString(lessons.size()));
        d.put("firstTime", lessons.get(0).get("time"));
        d.put("lessons", lessons);
        return send(Email.toCoach("coach-morning", coach, d),
                () -> repo.release(pk, "PROFILE", NotifyRepository.MORNING_EMAIL_SENT_ON, date.toString()));
    }

    // --------------------------------------------------------- sched-unpaid-reminder

    /**
     * Monday morning: one email per coach listing every lesson still unpaid from more than the threshold ago (7 days;
     * ADR-018, amended 2026-11-12), each at its share, a no-show labelled, and "attendance not recorded" where nothing was
     * recorded. A lesson is listed every Monday until it is paid or waived; each listed seat is stamped
     * {@code settleReminderSentOn} with this Monday, so a re-run for the same Monday doesn't list it twice. No threshold set
     * means nothing is sent.
     */
    public Unpaid unpaid(LocalDate monday) {
        if (unpaidThresholdDays == null) {
            return new Unpaid(0, 0);
        }
        LocalDate before = monday.minusDays(unpaidThresholdDays);
        Map<String, List<SeatRow>> byCoach = repo.unpaid().stream()
                .filter(r -> "UNPAID".equals(r.paymentStatus()) && r.seat().seatStatus() != Seat.Status.INVITED
                        && r.seat().lessonDate().isBefore(before) && !monday.toString().equals(r.guard(NotifyRepository.SETTLE_REMINDER_SENT_ON)))
                .sorted(Comparator.comparing((SeatRow r) -> r.seat().lessonDate()).thenComparing(r -> r.seat().startTime()))
                .collect(Collectors.groupingBy(r -> r.seat().coachId(), LinkedHashMap::new, Collectors.toList()));
        int emails = 0;
        int lessons = 0;
        for (Map.Entry<String, List<SeatRow>> e : byCoach.entrySet()) {
            CoachProfile coach = repo.coach(e.getKey()).orElse(null);
            if (coach == null) {
                continue;
            }
            String pk = "COACH#" + coach.coachId();
            List<SeatRow> mine = e.getValue().stream()
                    .filter(r -> repo.claim(pk, r.seat().key(), NotifyRepository.SETTLE_REMINDER_SENT_ON, monday.toString())).toList();
            if (mine.isEmpty()) {
                continue;
            }
            long total = 0;
            String currency = coach.currency().name();
            List<Map<String, Object>> rows = new ArrayList<>();
            for (SeatRow r : mine) {
                Seat s = r.seat();
                Optional<LessonTime> t = repo.lesson(coach.coachId(), s.lessonDate(), s.startTime());
                List<SeatRow> in = repo.seatsAt(coach.coachId(), s.lessonDate(), s.startTime());
                int amount = t.map(x -> NotificationService.share(x, s.studentId(), in)).orElse(0);
                currency = t.map(LessonTime::currency).orElse(currency);
                total += amount;
                List<String> notes = new ArrayList<>();
                if (s.seatStatus() == Seat.Status.NO_SHOW) {
                    notes.add("No-show");
                } else if (s.seatStatus() == Seat.Status.BOOKED) {
                    notes.add("Attendance not recorded");
                }
                if (NotificationService.booked(in).size() > 1) {
                    notes.add("Shared lesson · their share");
                }
                Map<String, Object> l = new LinkedHashMap<>();
                l.put("date", EmailFormat.date(s.lessonDate()));
                l.put("time", EmailFormat.time(s.startTime()));
                l.put("skater", s.studentName());
                l.put("amount", EmailFormat.money(amount, currency));
                l.put("note", String.join(" · ", notes));
                rows.add(l);
            }
            Map<String, Object> d = notifications.coachData(coach);
            d.put("lessonCount", Integer.toString(rows.size()));
            d.put("total", EmailFormat.money(total, currency));
            d.put("threshold", unpaidThresholdDays + (unpaidThresholdDays == 1 ? " day" : " days"));
            d.put("lessons", rows);
            if (send(Email.toCoach("coach-unpaid-weekly", coach, d),
                    () -> mine.forEach(r -> repo.release(pk, r.seat().key(), NotifyRepository.SETTLE_REMINDER_SENT_ON, monday.toString())))) {
                emails++;
                lessons += rows.size();
            }
        }
        return new Unpaid(emails, lessons);
    }

    // ----------------------------------------------------------- sched-lesson-roller

    /**
     * Nightly: each coach's missing lesson times, from {@code date} to the end of what's stored (the booking window plus 12
     * months, so a repeating booking has its dates), made from the schedule. It only adds: nothing is removed or re-priced.
     */
    public Rolled roll(LocalDate date) {
        int coaches = 0;
        int added = 0;
        for (String coachId : repo.coachIds()) {
            try {
                added += schedules.roll(new AccessContext(coachId), date);
                coaches++;
            } catch (RuntimeException e) {
                LOG.log(Level.WARNING, "sched-lesson-roller: one coach failed; the rest go on", e);
            }
        }
        return new Rolled(coaches, added);
    }

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
