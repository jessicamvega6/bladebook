package com.bladebook.api.coach.dto;

import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.PriceChange;
import com.bladebook.core.domain.TempSchedule;
import com.bladebook.core.service.ScheduleChangeService;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Time off, special schedules, the save preview and the save status (Batch 6). A special schedule's blocks use the
 * weekly {@link ScheduleDtos.TemplateDto}, with {@code days} ignored and {@code off} keyed by date:
 * {@code {"2026-12-22": ["10:00"]}}.
 */
public final class TempDtos {

    private TempDtos() {
    }

    /** {@code kind}: {@code TIME_OFF} or {@code SPECIAL}. {@code tempId} is null for a new one. */
    public record TempDto(String tempId, String kind, String name, String displayName, String startDate, String endDate,
                          List<ScheduleDtos.TemplateDto> templates) {

        public static TempDto of(TempSchedule t) {
            List<ScheduleDtos.TemplateDto> ts = new ArrayList<>();
            for (BlockTemplate b : t.templates()) {
                Map<String, List<String>> off = new TreeMap<>();
                t.off().getOrDefault(b.seq(), Map.of()).forEach((d, times) ->
                        off.put(d.toString(), times.stream().sorted().map(LocalTime::toString).toList()));
                ts.add(new ScheduleDtos.TemplateDto(b.seq(), b.name(), b.startTime().toString(), b.effectiveEnd().toString(),
                        b.lessonMinutes(), b.priceMinor(), b.maxSkaters(), b.iceType().name(), List.of(), off));
            }
            return new TempDto(t.tempId(), t.kind().name(), t.name(), t.displayName(), t.startDate().toString(), t.endDate().toString(), ts);
        }

        public TempSchedule toTemp() {
            TempSchedule.Kind k;
            if ("TIME_OFF".equals(kind)) {
                k = TempSchedule.Kind.TIME_OFF;
            } else if ("SPECIAL".equals(kind)) {
                k = TempSchedule.Kind.SPECIAL;
            } else {
                throw DomainException.invalid("kind", "Choose time off or a special schedule.");
            }
            List<BlockTemplate> blocks = new ArrayList<>();
            Map<Integer, Map<LocalDate, Set<LocalTime>>> off = new HashMap<>();
            if (k == TempSchedule.Kind.SPECIAL) {
                for (ScheduleDtos.TemplateDto t : templates == null ? List.<ScheduleDtos.TemplateDto>of() : templates) {
                    blocks.add(new BlockTemplate(t.seq(), t.name(), ScheduleDtos.time("startTime", t.startTime()),
                            ScheduleDtos.time("endTime", t.endTime()), t.lessonMinutes(), t.priceMinor(), t.maxSkaters(),
                            IceType.parse(t.iceType()), Set.of(), Map.of()));
                    Map<LocalDate, Set<LocalTime>> byDate = new HashMap<>();
                    if (t.off() != null) {
                        t.off().forEach((d, times) -> {
                            Set<LocalTime> ts = new HashSet<>();
                            for (String s : times == null ? List.<String>of() : times) {
                                ts.add(ScheduleDtos.time("off", s));
                            }
                            byDate.put(date(d), ts);
                        });
                    }
                    off.put(t.seq(), byDate);
                }
            }
            return new TempSchedule(tempId, k, name, startDate == null || startDate.isBlank() ? null : date(startDate),
                    endDate == null || endDate.isBlank() ? null : date(endDate), blocks, off);
        }
    }

    public record WhoDto(String studentId, String name, String familyId) {
    }

    public record ImpactDto(String date, String startTime, int durationMinutes, int priceMinor, Integer newPriceMinor, List<WhoDto> skaters) {
        static ImpactDto of(ScheduleChangeService.Impact i) {
            return new ImpactDto(i.date().toString(), i.startTime().toString(), i.durationMinutes(), i.priceMinor(), i.newPriceMinor(),
                    i.skaters().stream().map(w -> new WhoDto(w.studentId(), w.name(), w.familyId())).toList());
        }
    }

    public record BigChangeDto(int seq, String label, int fromMinor, int toMinor, int percent, boolean cut) {
        static BigChangeDto of(PriceChange c) {
            return new BigChangeDto(c.seq(), c.label(), c.fromMinor(), c.toMinor(), c.percent(), c.cut());
        }
    }

    /** The review page: what the save will cancel and re-price, what an increase won't reach, and big price changes. */
    public record PreviewDto(List<ImpactDto> cancel, List<ImpactDto> reprice, List<ImpactDto> kept, int families, List<BigChangeDto> big) {
        public static PreviewDto of(ScheduleChangeService.Preview p) {
            return new PreviewDto(p.cancel().stream().map(ImpactDto::of).toList(), p.reprice().stream().map(ImpactDto::of).toList(),
                    p.kept().stream().map(ImpactDto::of).toList(), p.families(), p.big().stream().map(BigChangeDto::of).toList());
        }
    }

    /** The newest schedule change's batch. {@code exists} false when no save has touched a booking yet. */
    public record StatusDto(boolean exists, String createdAt, String executionStatus, int lessonCount, int clientCount, boolean stuck,
                            List<ImpactDto> passed) {
        public static StatusDto of(java.util.Optional<ScheduleChangeService.Status> s) {
            return s.map(x -> new StatusDto(true, x.batch().createdAt().toString(), x.batch().executionStatus().name(),
                    x.batch().lessonCount(), x.batch().clientCount(), x.stuck(),
                    x.passed().stream().map(l -> new ImpactDto(l.lessonDate().toString(), l.startTime().toString(), l.durationMinutes(),
                            l.priceMinor(), null, List.of(new WhoDto(l.studentId(), l.studentName(), l.clientId())))).toList()))
                    .orElse(new StatusDto(false, null, null, 0, 0, false, List.of()));
        }
    }

    private static LocalDate date(String s) {
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("dates", "That date isn’t valid.");
        }
    }
}
