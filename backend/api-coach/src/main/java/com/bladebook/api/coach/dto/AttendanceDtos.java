package com.bladebook.api.coach.dto;

import com.bladebook.core.service.AttendanceService;

import java.util.List;

/** The rinkside page and the Lessons page (Batch 7). Dates and times are the coach's own. */
public final class AttendanceDtos {

    private AttendanceDtos() {
    }

    /** {@code status}: {@code BOOKED}, {@code CHECKED_IN}, {@code NO_SHOW} or {@code NOT_RECORDED}. */
    public record SkaterDto(String studentId, String shortName, String fullName, String familyName, String status, String outcomeAt) {
        public static SkaterDto of(AttendanceService.Skater s) {
            return new SkaterDto(s.studentId(), s.shortName(), s.fullName(), s.familyName(), s.status().name(),
                    s.outcomeAt() == null ? null : s.outcomeAt().toString());
        }
    }

    /** {@code lessonStatus}: {@code BOOKED} or {@code HELD}. */
    public record RinkLessonDto(String date, String startTime, int durationMinutes, String startsAtUtc, String lessonStatus, List<SkaterDto> skaters) {
    }

    public record TodayDto(String coachFirstName, String coachTimezone, String today, String now, List<RinkLessonDto> lessons) {
        public static TodayDto of(AttendanceService.RinkDay d) {
            return new TodayDto(d.coachFirstName(), d.coachTimezone(), d.today().toString(), d.now().toString(), d.lessons().stream()
                    .map(l -> new RinkLessonDto(l.time().lessonDate().toString(), l.time().startTime().toString(), l.time().durationMinutes(),
                            l.time().startsAtUtc().toString(), l.time().lessonStatus().name(), l.skaters().stream().map(SkaterDto::of).toList()))
                    .toList());
        }
    }

    /** {@code outcome}: {@code CHECKED_IN} or {@code NO_SHOW}; {@code outcomeAt} the phone's tap time (rinkside only). */
    public record OutcomeBody(String date, String startTime, String studentId, String outcome, String outcomeAt) {
    }

    public record ContactDto(String studentName, boolean isMinor, String relationship, String clientName, String phone, String email) {
        public static ContactDto of(AttendanceService.Contact c) {
            return new ContactDto(c.studentName(), c.isMinor(), c.relationship().name(), c.clientName(), c.phone(), c.email());
        }
    }

    public record PastLessonDto(String date, String startTime, int durationMinutes, SkaterDto skater, List<String> sharedWith) {
        public static PastLessonDto of(AttendanceService.PastLesson p) {
            return new PastLessonDto(p.date().toString(), p.startTime().toString(), p.durationMinutes(), SkaterDto.of(p.skater()), p.sharedWith());
        }
    }
}
