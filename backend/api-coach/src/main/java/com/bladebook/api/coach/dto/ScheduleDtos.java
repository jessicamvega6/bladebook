package com.bladebook.api.coach.dto;

import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.LessonTime;
import com.bladebook.core.domain.CoachCancelRequest;
import com.bladebook.core.service.CalendarService;
import com.bladebook.core.service.CoachCancelService;
import com.bladebook.core.service.ScheduleService;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * What api-coach sends and accepts for the weekly schedule and the calendar. Times are the coach's local
 * {@code HH:mm}; days are {@code 0} (Sunday) to {@code 6} (Saturday), as in {@code schedule-cases.json}.
 */
public final class ScheduleDtos {

    private ScheduleDtos() {
    }

    /** One block template. {@code off} lists the slots switched off, by day: {@code {"1": ["07:00"]}}. */
    public record TemplateDto(int seq, String name, String startTime, String endTime, Integer lessonMinutes,
                              Integer priceMinor, Integer maxSkaters, String iceType, List<Integer> days,
                              Map<String, List<String>> off) {

        static TemplateDto of(BlockTemplate t) {
            List<Integer> days = new ArrayList<>();
            for (DayOfWeek d : t.days()) {
                days.add(index(d));
            }
            days.sort(null);
            Map<String, List<String>> off = new TreeMap<>();
            t.off().forEach((d, times) -> off.put(Integer.toString(index(d)),
                    times.stream().sorted().map(LocalTime::toString).toList()));
            return new TemplateDto(t.seq(), t.name(), str(t.startTime()), str(t.endTime()), t.lessonMinutes(),
                    t.priceMinor(), t.maxSkaters(), t.iceType() == null ? null : t.iceType().name(), days, off);
        }

        BlockTemplate toTemplate() {
            Set<DayOfWeek> ds = EnumSet.noneOf(DayOfWeek.class);
            for (Integer i : days == null ? List.<Integer>of() : days) {
                ds.add(day(i));
            }
            Map<DayOfWeek, Set<LocalTime>> o = new EnumMap<>(DayOfWeek.class);
            if (off != null) {
                off.forEach((k, times) -> {
                    int i;
                    try {
                        i = Integer.parseInt(k);
                    } catch (NumberFormatException e) {
                        throw DomainException.invalid("off", "Something in the form couldn't be read. Reload and try again.");
                    }
                    Set<LocalTime> ts = new HashSet<>();
                    for (String s : times == null ? List.<String>of() : times) {
                        ts.add(time("off", s));
                    }
                    o.put(day(i), ts);
                });
            }
            return new BlockTemplate(seq, name, time("startTime", startTime), time("endTime", endTime), lessonMinutes,
                    priceMinor, maxSkaters, IceType.parse(iceType), ds, o);
        }
    }

    public record ScheduleResponse(long scheduleVersion, boolean exists, List<TemplateDto> templates) {

        public static ScheduleResponse of(ScheduleService.ScheduleView v) {
            return new ScheduleResponse(v.scheduleVersion(), v.exists(), v.templates().stream().map(TemplateDto::of).toList());
        }
    }

    /** A save: the templates, and the version the editor opened. */
    public record SaveRequest(long scheduleVersion, List<TemplateDto> templates) {

        public List<BlockTemplate> toTemplates() {
            if (templates == null) {
                return List.of();
            }
            return templates.stream().map(TemplateDto::toTemplate).toList();
        }
    }

    /** One lesson time as the coach's calendar shows it. */
    /** A skater in a booked time: "Ava P." for the week view; the full name and family for the day view. */
    public record SkaterDto(String studentId, String shortName, String fullName, String familyName, String familyId, int repeatsEveryWeeks) {
    }

    public record LessonDto(String startTime, int durationMinutes, int priceMinor, String currency, String lessonStatus,
                            int maxSkaters, int seatsTaken, List<SkaterDto> skaters) {

        static LessonDto of(LessonTime t, List<CalendarService.Booked> booked) {
            List<SkaterDto> in = booked.stream().filter(b -> b.startTime().equals(t.startTime()))
                    .map(b -> new SkaterDto(b.studentId(), b.shortName(), b.fullName(), b.familyName(), b.familyId(), b.repeatsEveryWeeks())).toList();
            return new LessonDto(t.startTime().toString(), t.durationMinutes(), t.priceMinor(), t.currency(),
                    t.lessonStatus().name(), t.maxSkaters(), t.seatsTaken(), in);
        }
    }

    /** {@code special}: the time off or special schedule on that date ({@code kind}, {@code name}, dates), or null. */
    public record SpecialDto(String kind, String name, String startDate, String endDate) {
    }

    public record DayDto(String date, boolean override, List<LessonDto> lessons, SpecialDto special) {
    }

    /** {@code today} and {@code now} are the coach's, in the coach's time zone. */
    public record CalendarResponse(String coachTimezone, String today, String now, boolean hasSchedule, List<DayDto> days) {

        public static CalendarResponse of(CalendarService.CalendarView v) {
            return new CalendarResponse(v.coachTimezone(), v.today().toString(), v.now().toString(), v.hasSchedule(),
                    v.days().stream().map(d -> new DayDto(d.date().toString(), d.override(),
                            d.lessons().stream().map(t -> LessonDto.of(t, d.booked())).toList(),
                            d.special() == null ? null : new SpecialDto(d.special().kind().name(), d.special().displayName(),
                                    d.special().startDate().toString(), d.special().endDate().toString()))).toList());
        }
    }

    // ---------------------------------------------------------------- helpers

    static int index(DayOfWeek d) {
        return d.getValue() % 7;
    }

    static DayOfWeek day(Integer i) {
        if (i == null || i < 0 || i > 6) {
            throw DomainException.invalid("days", "Pick days from Sunday to Saturday.");
        }
        return i == 0 ? DayOfWeek.SUNDAY : DayOfWeek.of(i);
    }

    /** {@code HH:mm} on the quarter hour (ADR-MASTER section 6), or {@code null} when blank. */
    public static LocalTime time(String field, String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        LocalTime t;
        try {
            t = LocalTime.parse(s.trim());
        } catch (DateTimeParseException e) {
            throw DomainException.invalid(field, "Pick a time from the list.");
        }
        if (t.getMinute() % 15 != 0 || t.getSecond() != 0 || t.getNano() != 0) {
            throw DomainException.invalid(field, "Pick a time from the list.");
        }
        return t;
    }

    private static String str(LocalTime t) {
        return t == null ? null : t.toString();
    }

    /** One lesson to cancel, with its own release-or-hold choice ({@code RELEASE} or {@code HOLD}). */
    public record CancelPickDto(String date, String startTime, String after) {
    }

    /** {@code scope}: {@code LESSON}, {@code DAY} or {@code WEEK}. The week names only its Sunday. */
    public record CancelRequest(String scope, List<CancelPickDto> picks, String weekStart) {
        public CoachCancelRequest toRequest() {
            return CoachCancelRequest.parse(scope, picks == null ? null
                    : picks.stream().map(p -> p == null ? null : new CoachCancelRequest.PickInput(p.date(), p.startTime(), p.after())).toList(),
                    weekStart);
        }
    }

    public record CancelResponse(int cancelled, int held, int openHeld, int families, int skipped) {
        public static CancelResponse of(CoachCancelService.Result r) {
            return new CancelResponse(r.cancelled(), r.held(), r.openHeld(), r.families(), r.skipped());
        }
    }
}
