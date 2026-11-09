package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The lesson times a schedule makes over a range of dates (ADR-031 decision 1).
 *
 * <p><b>Daylight saving</b> (settled in Batch 2; the ADRs require the tests but not the rule): a time
 * is made only if its start exists on the coach's clock that day and it really lasts its length. So on
 * the spring-forward day the times between 2:00 and 3:00 AM aren't made, and on the fall-back day the
 * first 1:00 AM hour is used and a lesson that would run across the change isn't made.
 */
public final class LessonTimes {

    private LessonTimes() {
    }

    /**
     * Every {@code OPEN} lesson time from {@code from} to {@code to} inclusive that starts after {@code now}.
     *
     * @param weekly the default schedule, or {@code null}
     * @param overrides date overrides by date
     */
    public static List<LessonTime> make(WeeklySchedule weekly, Map<LocalDate, List<ScheduleBlock>> overrides,
                                        LocalDate from, LocalDate to, ZoneId zone, String currency,
                                        int requiredNoticeHours, Instant now) {
        long version = weekly == null ? 0 : weekly.scheduleVersion();
        List<LessonTime> out = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            for (ScheduleBlock b : ScheduleForDate.blocks(d, weekly, overrides)) {
                for (LocalTime t : b.slots()) {
                    Instant start = startOf(d, t, b.lessonMinutes(), zone);
                    if (start == null || !start.isAfter(now)) {
                        continue;
                    }
                    out.add(new LessonTime(d, t, start, zone.getId(), b.lessonMinutes(), b.priceMinor(), currency,
                            b.missedLessonFeeMinor(), requiredNoticeHours, b.maxSkaters(), 0, b.seq(), b.iceType(),
                            version, LessonTime.Status.OPEN));
                }
            }
        }
        out.sort((a, b) -> a.key().compareTo(b.key()));
        return out;
    }

    /** The moment the lesson starts, or {@code null} if it can't be held that day (see the class note). */
    static Instant startOf(LocalDate date, LocalTime t, int minutes, ZoneId zone) {
        LocalDateTime local = date.atTime(t);
        if (zone.getRules().getValidOffsets(local).isEmpty()) {
            return null;
        }
        ZonedDateTime start = ZonedDateTime.ofLocal(local, zone, null); // the earlier offset in a repeated hour
        ZonedDateTime end = ZonedDateTime.ofLocal(local.plusMinutes(minutes), zone, null);
        return Duration.between(start, end).toMinutes() == minutes ? start.toInstant() : null;
    }
}
