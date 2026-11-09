package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.ScheduleRules;
import com.bladebook.core.domain.WeeklySchedule;

import java.util.List;

/**
 * The weekly schedule as the editor reads and saves it (ADR-008, ADR-MASTER section 6). Saving writes the
 * schedule and nothing else; the lesson times follow from {@link ScheduleChangeService}, which the
 * {@code ScheduleChanged} event runs (ADR-MASTER section 9).
 */
public final class ScheduleService {

    /** The editor's view: the templates, and the version they were read at ({@code 0} = never saved). */
    public record ScheduleView(List<BlockTemplate> templates, long scheduleVersion) {

        public ScheduleView {
            templates = List.copyOf(templates);
        }

        public boolean exists() {
            return scheduleVersion > 0;
        }
    }

    private final ScheduleRepository schedules;
    private final CoachRepository coaches;

    public ScheduleService(ScheduleRepository schedules, CoachRepository coaches) {
        this.schedules = schedules;
        this.coaches = coaches;
    }

    public ScheduleView schedule(AccessContext ctx) {
        return schedules.findDefault(ctx).map(ScheduleService::view).orElse(new ScheduleView(List.of(), 0));
    }

    /**
     * Saves the week.
     *
     * @param readVersion the version the editor opened ({@code 0} if there was none)
     * @throws DomainException INVALID with every problem; CONFLICT if it changed since {@code readVersion};
     *                         NOT_FOUND before sign-up is finished
     */
    public ScheduleView save(AccessContext ctx, long readVersion, List<BlockTemplate> templates) {
        if (readVersion < 0) {
            throw DomainException.invalid("scheduleVersion", "Reload the page and try again.");
        }
        if (coaches.find(ctx).isEmpty()) {
            throw DomainException.notFound("Finish setting up your account first.");
        }
        WeeklySchedule next = ScheduleRules.toWeekly(templates, readVersion + 1);
        schedules.saveDefault(ctx, next);
        return view(next);
    }

    private static ScheduleView view(WeeklySchedule w) {
        return new ScheduleView(ScheduleRules.fromWeekly(w), w.scheduleVersion());
    }
}
