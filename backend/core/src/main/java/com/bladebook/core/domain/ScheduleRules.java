package com.bladebook.core.domain;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * The weekly editor's rules (ADR-008 decisions 2a, 3, 4, 5 and 8; ADR-MASTER section 6): block
 * templates become the stored per-day blocks, the stored blocks become templates again for editing, and
 * {@link #problems} says what stops a save. Shared with {@code web/src/shared/logic/schedule.ts}; both
 * pass {@code schedule-cases.json}, messages included.
 *
 * <p><b>Back to templates</b> (settled in Batch 2; the ADRs don't say how the editor reopens a saved
 * week): every block a template makes keeps the template's {@code seq}, so the blocks are grouped by
 * {@code seq} again. The days are the days with a block, the start and end the earliest start and latest
 * end, and a slot inside that range with no block on a day is switched off on that day.
 */
public final class ScheduleRules {

    /** ADR-008 decision 5. */
    public static final List<Integer> LESSON_LENGTHS = List.of(30, 45, 60, 90, 120);
    /** The most skaters per lesson a coach may choose, held as a setting (ADR-026 decision 1). */
    public static final int MAX_SKATERS = 2;
    /** ADR-008 decision 2a. */
    public static final int MAX_NAME = 40;
    /** Prices are under $10,000 (settled in Batch 2). */
    public static final int MAX_PRICE_MINOR = 999_999;

    /** Sunday first, as the calendars show it. */
    static final List<DayOfWeek> WEEK = List.of(DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY);

    private ScheduleRules() {
    }

    // ------------------------------------------------------------- validation

    /** Everything that stops a save, in the order the editor lists it. Empty means it can be saved. */
    public static List<String> problems(List<BlockTemplate> templates) {
        List<String> out = new ArrayList<>();
        if (templates.isEmpty()) {
            out.add("Add at least one block.");
            return out;
        }
        Set<Integer> seqs = new HashSet<>();
        for (BlockTemplate t : templates) {
            if (t.seq() <= 0 || !seqs.add(t.seq())) {
                out.add("Two blocks have the same number. Reload the page and try again.");
                break;
            }
        }
        for (BlockTemplate t : templates) {
            String l = t.label();
            String name = t.name().trim();
            if (name.length() > MAX_NAME) {
                out.add("A block name can be up to " + MAX_NAME + " characters.");
            } else if (name.chars().anyMatch(Character::isISOControl)) {
                out.add("A block name has a character it can’t hold.");
            }
            boolean lengthOk = t.lessonMinutes() != null && LESSON_LENGTHS.contains(t.lessonMinutes());
            if (t.startTime() == null) {
                out.add(l + " needs a start time.");
            }
            if (!lengthOk) {
                out.add(l + " needs a lesson length.");
            }
            if (t.startTime() != null && lengthOk) {
                if (t.endTime() == null && !t.startTime().isBefore(Slots.DEFAULT_END)) {
                    out.add(l + " needs an end time.");
                } else if (t.endTime() != null && !t.endTime().isAfter(t.startTime())) {
                    out.add(l + " ends before it starts.");
                } else if (slots(t).isEmpty()) {
                    out.add(l + " is too short for one " + t.lessonMinutes() + "-minute lesson.");
                }
            }
            if (t.days().isEmpty()) {
                out.add(l + " has no days selected. Pick at least one day.");
            }
            if (t.priceMinor() == null || t.priceMinor() < 0) {
                out.add(l + " needs a price.");
            } else if (t.priceMinor() > MAX_PRICE_MINOR) {
                out.add(l + "’s price must be under $10,000.");
            }
            if (t.maxSkaters() == null || t.maxSkaters() < 1 || t.maxSkaters() > MAX_SKATERS) {
                out.add(l + " can have 1 or " + MAX_SKATERS + " skaters per lesson.");
            }
            if (t.iceType() == null) {
                out.add(l + " has no ice type. Pick one.");
            }
            if (timesValid(t) && !t.days().isEmpty() && t.days().stream().allMatch(d -> runs(t, d).isEmpty())) {
                out.add("Every time in " + l + " is switched off. Switch some back on, or delete the block.");
            }
        }
        out.addAll(overlaps(templates));
        return out;
    }

    private static List<String> overlaps(List<BlockTemplate> templates) {
        List<String> out = new ArrayList<>();
        for (DayOfWeek day : WEEK) {
            for (int i = 0; i < templates.size(); i++) {
                BlockTemplate a = templates.get(i);
                if (!timesValid(a) || !a.days().contains(day)) {
                    continue;
                }
                for (int j = i + 1; j < templates.size(); j++) {
                    BlockTemplate b = templates.get(j);
                    if (timesValid(b) && b.days().contains(day) && overlap(runs(a, day), runs(b, day))) {
                        out.add(dayName(day) + ": " + a.label() + " (" + range(a.startTime(), a.effectiveEnd()) + ") and "
                                + b.label() + " (" + range(b.startTime(), b.effectiveEnd()) + ") overlap in time.");
                    }
                }
            }
        }
        return out;
    }

    private static boolean overlap(List<int[]> a, List<int[]> b) {
        for (int[] x : a) {
            for (int[] y : b) {
                if (x[0] < y[1] && y[0] < x[1]) {
                    return true;
                }
            }
        }
        return false;
    }

    // ------------------------------------------------------- templates → blocks

    /**
     * Each day's stored blocks, in time order: one per contiguous run of slots left on. Templates whose
     * times aren't valid make none.
     */
    public static Map<DayOfWeek, List<ScheduleBlock>> blocks(List<BlockTemplate> templates) {
        Map<DayOfWeek, List<ScheduleBlock>> out = new EnumMap<>(DayOfWeek.class);
        for (BlockTemplate t : templates) {
            if (!timesValid(t)) {
                continue;
            }
            String name = t.name().trim().isEmpty() ? null : t.name().trim();
            for (DayOfWeek d : t.days()) {
                for (int[] r : runs(t, d)) {
                    out.computeIfAbsent(d, k -> new ArrayList<>()).add(new ScheduleBlock(t.seq(), name,
                            Slots.time(r[0]), Slots.time(r[1]), t.lessonMinutes(),
                            t.priceMinor() == null ? 0 : t.priceMinor(), 0,
                            t.maxSkaters() == null ? 1 : t.maxSkaters(), t.iceType()));
                }
            }
        }
        out.values().forEach(l -> l.sort(Comparator.comparing(ScheduleBlock::startTime)));
        return out;
    }

    /**
     * The schedule to store.
     *
     * @throws DomainException INVALID on field {@code blocks}, every problem on its own line
     */
    public static WeeklySchedule toWeekly(List<BlockTemplate> templates, long scheduleVersion) {
        List<String> problems = problems(templates);
        if (!problems.isEmpty()) {
            throw DomainException.invalid("blocks", String.join("\n", problems));
        }
        return new WeeklySchedule(blocks(templates), scheduleVersion);
    }

    // ------------------------------------------------------- blocks → templates

    /** The templates the editor shows for a stored schedule, ordered by {@code seq}. See the class note. */
    public static List<BlockTemplate> fromWeekly(WeeklySchedule weekly) {
        Map<Integer, Map<DayOfWeek, List<ScheduleBlock>>> bySeq = new TreeMap<>();
        for (DayOfWeek d : WEEK) {
            for (ScheduleBlock b : weekly.blocksOn(d)) {
                bySeq.computeIfAbsent(b.seq(), k -> new EnumMap<>(DayOfWeek.class))
                        .computeIfAbsent(d, k -> new ArrayList<>()).add(b);
            }
        }
        List<BlockTemplate> out = new ArrayList<>();
        bySeq.forEach((seq, days) -> {
            ScheduleBlock first = days.values().iterator().next().get(0);
            LocalTime start = LocalTime.MAX;
            LocalTime end = LocalTime.MIN;
            for (List<ScheduleBlock> bs : days.values()) {
                for (ScheduleBlock b : bs) {
                    start = b.startTime().isBefore(start) ? b.startTime() : start;
                    end = b.endTime().isAfter(end) ? b.endTime() : end;
                }
            }
            List<LocalTime> all = Slots.expand(start, end, first.lessonMinutes());
            Map<DayOfWeek, Set<LocalTime>> off = new EnumMap<>(DayOfWeek.class);
            days.forEach((d, bs) -> {
                Set<LocalTime> o = new HashSet<>();
                for (LocalTime s : all) {
                    if (bs.stream().noneMatch(b -> !s.isBefore(b.startTime()) && s.isBefore(b.endTime()))) {
                        o.add(s);
                    }
                }
                off.put(d, o);
            });
            out.add(new BlockTemplate(seq, first.blockName() == null ? "" : first.blockName(), start, end,
                    first.lessonMinutes(), first.priceMinor(), first.maxSkaters(), first.iceType(),
                    EnumSet.copyOf(days.keySet()), off));
        });
        return out;
    }

    /** One above the highest {@code seq}: numbers are never renumbered (ADR-008 decision 2a). */
    public static int nextSeq(List<BlockTemplate> templates) {
        return templates.stream().mapToInt(BlockTemplate::seq).max().orElse(0) + 1;
    }

    // ---------------------------------------------------------------- wording

    /** {@code 6–11:30 AM}, {@code 10 AM–5 PM}: the first meridiem is dropped when both match. */
    public static String range(LocalTime a, LocalTime b) {
        String ma = meridiem(a);
        String mb = meridiem(b);
        return ma.equals(mb) ? clock(a) + "–" + clock(b) + " " + mb : clock(a) + " " + ma + "–" + clock(b) + " " + mb;
    }

    private static String clock(LocalTime t) {
        int h = t.getHour() % 12 == 0 ? 12 : t.getHour() % 12;
        return t.getMinute() == 0 ? Integer.toString(h) : h + ":" + String.format("%02d", t.getMinute());
    }

    private static String meridiem(LocalTime t) {
        return t.getHour() < 12 ? "AM" : "PM";
    }

    private static String dayName(DayOfWeek d) {
        return d.getDisplayName(TextStyle.FULL, Locale.US);
    }

    // ---------------------------------------------------------------- helpers

    private static boolean timesValid(BlockTemplate t) {
        if (t.startTime() == null || t.lessonMinutes() == null || !LESSON_LENGTHS.contains(t.lessonMinutes())) {
            return false;
        }
        if (t.endTime() != null && !t.endTime().isAfter(t.startTime())) {
            return false;
        }
        return !slots(t).isEmpty();
    }

    private static List<LocalTime> slots(BlockTemplate t) {
        return Slots.expand(t.startTime(), t.effectiveEnd(), t.lessonMinutes());
    }

    /** Contiguous runs of the slots left on, as {start, end} minutes. */
    private static List<int[]> runs(BlockTemplate t, DayOfWeek day) {
        List<int[]> out = new ArrayList<>();
        int len = t.lessonMinutes();
        int[] cur = null;
        for (LocalTime s : slots(t)) {
            if (t.isOff(day, s)) {
                cur = null;
                continue;
            }
            int m = Slots.minutes(s);
            if (cur != null && cur[1] == m) {
                cur[1] = m + len;
            } else {
                cur = new int[] {m, m + len};
                out.add(cur);
            }
        }
        return out;
    }
}
