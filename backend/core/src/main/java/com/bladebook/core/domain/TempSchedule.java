package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Time off or a special schedule (ADR-MASTER section 6, "Temporary schedules"): a named range of dates that
 * replaces the weekly schedule. Stored as one {@code SCHEDULE#DATE#<date>} item per date, each carrying the
 * {@code tempId}, and this header, {@code SCHEDULE#TEMP#<tempId>}, written last.
 *
 * <p><b>Time off</b> has no blocks: every date in it has no lessons. A <b>special schedule</b>'s blocks apply to
 * every date in its range ({@code days} on its templates is ignored); a time switched off is switched off on one
 * date only, so {@code off} is kept per block and per date.
 */
public record TempSchedule(String tempId, Kind kind, String name, LocalDate startDate, LocalDate endDate,
                           List<BlockTemplate> templates, Map<Integer, Map<LocalDate, Set<LocalTime>>> off) {

    public enum Kind { TIME_OFF, SPECIAL }

    public TempSchedule {
        name = name == null ? "" : name.trim();
        templates = templates == null ? List.of() : List.copyOf(templates);
        Map<Integer, Map<LocalDate, Set<LocalTime>>> o = new HashMap<>();
        if (off != null) {
            off.forEach((seq, byDate) -> {
                Map<LocalDate, Set<LocalTime>> m = new HashMap<>();
                if (byDate != null) {
                    byDate.forEach((d, times) -> {
                        if (times != null && !times.isEmpty()) {
                            m.put(d, Set.copyOf(times));
                        }
                    });
                }
                if (!m.isEmpty()) {
                    o.put(seq, Map.copyOf(m));
                }
            });
        }
        off = Map.copyOf(o);
    }

    public static String key(String tempId) {
        return "SCHEDULE#TEMP#" + tempId;
    }

    public String key() {
        return key(tempId);
    }

    /** The name the coach gave it, or what the design calls one without a name. */
    public String displayName() {
        if (!name.isBlank()) {
            return name;
        }
        return kind == Kind.TIME_OFF ? "Time off" : "Special schedule";
    }

    public List<LocalDate> dates() {
        List<LocalDate> out = new ArrayList<>();
        if (startDate != null && endDate != null) {
            for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
                out.add(d);
            }
        }
        return out;
    }

    public boolean covers(LocalDate date) {
        return !date.isBefore(startDate) && !date.isAfter(endDate);
    }

    /** The dates this and {@code other} share: the first and last, or {@code null} if none. */
    public LocalDate[] overlap(TempSchedule other) {
        LocalDate s = startDate.isAfter(other.startDate) ? startDate : other.startDate;
        LocalDate e = endDate.isBefore(other.endDate) ? endDate : other.endDate;
        return s.isAfter(e) ? null : new LocalDate[] {s, e};
    }

    /** The blocks on one of its dates: none for time off; a special schedule's blocks with that date's times off. */
    public List<ScheduleBlock> blocksOn(LocalDate date) {
        if (kind == Kind.TIME_OFF) {
            return List.of();
        }
        DayOfWeek dow = date.getDayOfWeek();
        List<BlockTemplate> onDate = new ArrayList<>();
        for (BlockTemplate t : templates) {
            Map<DayOfWeek, Set<LocalTime>> o = new EnumMap<>(DayOfWeek.class);
            Set<LocalTime> times = off.getOrDefault(t.seq(), Map.of()).get(date);
            if (times != null) {
                o.put(dow, times);
            }
            onDate.add(new BlockTemplate(t.seq(), t.name(), t.startTime(), t.endTime(), t.lessonMinutes(), t.priceMinor(),
                    t.maxSkaters(), t.iceType(), Set.of(dow), o));
        }
        return ScheduleRules.blocks(onDate).getOrDefault(dow, List.of());
    }

    /** Each of its dates with its blocks: what the {@code SCHEDULE#DATE#} items hold. */
    public Map<LocalDate, List<ScheduleBlock>> dateBlocks() {
        Map<LocalDate, List<ScheduleBlock>> out = new HashMap<>();
        dates().forEach(d -> out.put(d, blocksOn(d)));
        return out;
    }
}
