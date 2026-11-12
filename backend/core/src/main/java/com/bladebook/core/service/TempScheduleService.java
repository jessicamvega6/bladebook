package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.TempRules;
import com.bladebook.core.domain.TempSchedule;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * Time off and special schedules (ADR-MASTER section 6; FeatureDecriptions/C_Coach Time Off.md and Schedule Creater.md).
 * Saving writes the date items and the header and nothing else; the lesson times follow from
 * {@link ScheduleChangeService#apply}, which the {@code ScheduleChanged} event runs. Editing replaces every date
 * of the old version: per-date changes inside it are lost (ADR-008 decision 7a).
 */
public final class TempScheduleService {

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;
    private final ScheduleChangeService change;
    private final Clock clock;

    public TempScheduleService(ScheduleRepository schedules, CoachRepository coaches, ScheduleChangeService change, Clock clock) {
        this.schedules = schedules;
        this.coaches = coaches;
        this.change = change;
        this.clock = clock;
    }

    /** Every one that hasn't ended, by start date: the hub's list. */
    public List<TempSchedule> upcoming(AccessContext ctx) {
        LocalDate today = today(ctx);
        return schedules.temps(ctx).stream().filter(t -> !t.endDate().isBefore(today)).toList();
    }

    public TempSchedule get(AccessContext ctx, String tempId) {
        return schedules.temp(ctx, tempId).orElseThrow(() -> DomainException.notFound("That time off or special schedule couldn’t be found."));
    }

    /** The review page: refused with every problem, as the save would be. {@code tempId} null for a new one. */
    public ScheduleChangeService.Preview preview(AccessContext ctx, TempSchedule proposed) {
        TempSchedule previous = previous(ctx, proposed.tempId());
        TempSchedule t = check(ctx, proposed, previous);
        return change.previewTemp(ctx, t, previous);
    }

    /** Saves it; a new one gets its id here. Returns what was stored. */
    public TempSchedule save(AccessContext ctx, TempSchedule proposed) {
        TempSchedule previous = previous(ctx, proposed.tempId());
        TempSchedule t = check(ctx, proposed, previous);
        schedules.saveTemp(ctx, t, previous);
        return t;
    }

    private TempSchedule check(AccessContext ctx, TempSchedule proposed, TempSchedule previous) {
        if (previous != null && previous.kind() != proposed.kind()) {
            throw DomainException.invalid("kind", "Time off can’t become a special schedule. Add a new one instead.");
        }
        String id = previous != null ? previous.tempId() : UUID.randomUUID().toString();
        TempSchedule t = new TempSchedule(id, proposed.kind(), proposed.name(), proposed.startDate(), proposed.endDate(),
                proposed.kind() == TempSchedule.Kind.TIME_OFF ? List.of() : proposed.templates(), proposed.off());
        List<String> problems = TempRules.problems(t, schedules.temps(ctx), today(ctx), previous == null ? null : previous.startDate());
        if (!problems.isEmpty()) {
            throw DomainException.invalid("dates", String.join("\n", problems));
        }
        return t;
    }

    private TempSchedule previous(AccessContext ctx, String tempId) {
        return tempId == null || tempId.isBlank() ? null : get(ctx, tempId);
    }

    private LocalDate today(AccessContext ctx) {
        String zone = coaches.find(ctx).orElseThrow(() -> DomainException.notFound("Finish setting up your account first.")).coachTimezone();
        return LocalDate.ofInstant(clock.instant(), ZoneId.of(zone));
    }
}
