package com.bladebook.api.client.dto;

import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.service.BookingService;

import java.util.List;

/**
 * The booking pages' calls (ADR-MASTER section 7). Dates are the coach's local dates ({@code 2026-11-16}) and
 * times the coach's local times ({@code 06:00}), always shown with the coach's time zone.
 */
public final class BookingDtos {

    private BookingDtos() {
    }

    public record TimeDto(String date, String startTime, String endTime, int durationMinutes, int priceMinor, String currency,
                          int blockSeq, String blockName, boolean free, boolean started) {
    }

    public record LessonDto(String coachId, String coachFirstName, String studentId, String studentName, String date,
                            String startTime, int durationMinutes, String startsAtUtc, String coachTz) {
        public static LessonDto of(BookingService.FamilyLesson l) {
            return new LessonDto(l.coachId(), l.coachFirstName(), l.studentId(), l.studentName(), l.date().toString(),
                    l.startTime().toString(), l.durationMinutes(), l.startsAtUtc().toString(), l.coachTz());
        }
    }

    public record PageResponse(String coachFirstName, String coachLastName, String coachTimezone, int requiredNoticeHours,
                               String today, String now, String windowFirst, String windowLast, boolean hasSchedule,
                               List<TimeDto> times, List<LessonDto> familyLessons) {
        public static PageResponse of(BookingService.BookingPage p) {
            return new PageResponse(p.coachFirstName(), p.coachLastName(), p.coachTimezone(), p.requiredNoticeHours(),
                    p.today().toString(), p.now().toString(), p.windowFirst().toString(), p.windowLast().toString(), p.hasSchedule(),
                    p.times().stream().map(t -> new TimeDto(t.date().toString(), t.startTime().toString(), t.endTime().toString(),
                            t.durationMinutes(), t.priceMinor(), t.currency(), t.blockSeq(), t.blockName(), t.free(), t.started())).toList(),
                    p.familyLessons().stream().map(LessonDto::of).toList());
        }
    }

    public record PickBody(String date, String startTime) {
    }

    /** One request per coach (ADR-025 d3). The website makes {@code idempotencyKey} and resends it on a retry. */
    public record BookBody(String coachId, String studentId, String idempotencyKey, List<PickBody> picks) {
        public BookingRequest toRequest() {
            List<BookingRequest.PickInput> in = picks == null ? null
                    : picks.stream().map(p -> p == null ? null : new BookingRequest.PickInput(p.date(), p.startTime())).toList();
            return BookingRequest.parse(coachId, studentId, idempotencyKey, in);
        }
    }

    /** {@code message} only for an unavailable date: the one wording for every cause (B1). */
    public record PickResultDto(String date, String startTime, String outcome, String message, Integer durationMinutes,
                                Integer priceMinor, String currency) {
    }

    public record BookResponse(String coachFirstName, String studentName, List<PickResultDto> picks) {
        public static BookResponse of(BookingService.BookingResult r) {
            return new BookResponse(r.coachFirstName(), r.studentName(), r.picks().stream().map(p -> new PickResultDto(
                    p.date().toString(), p.startTime().toString(), p.outcome().name(),
                    p.outcome() == BookingOutcome.UNAVAILABLE ? BookingOutcome.UNAVAILABLE_MESSAGE : null,
                    p.durationMinutes(), p.priceMinor(), p.currency())).toList());
        }
    }
}
