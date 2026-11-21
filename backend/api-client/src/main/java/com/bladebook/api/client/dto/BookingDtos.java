package com.bladebook.api.client.dto;

import com.bladebook.core.domain.BookingOutcome;
import com.bladebook.core.domain.BookingRequest;
import com.bladebook.core.service.BookingService;
import com.bladebook.core.service.CancellationService;

import java.util.List;

/**
 * The booking pages' calls (ADR-MASTER section 7). Dates are the coach's local dates ({@code 2026-11-16}) and
 * times the coach's local times ({@code 06:00}), always shown with the coach's time zone.
 */
public final class BookingDtos {

    private BookingDtos() {
    }

    public record TimeDto(String date, String startTime, String endTime, int durationMinutes, int priceMinor, String currency,
                          int blockSeq, String blockName, boolean free, boolean started, boolean shareable) {
    }

    public record LessonDto(String coachId, String coachFirstName, String studentId, String studentName, String date,
                            String startTime, int durationMinutes, String startsAtUtc, String coachTz) {
        public static LessonDto of(BookingService.FamilyLesson l) {
            return new LessonDto(l.coachId(), l.coachFirstName(), l.studentId(), l.studentName(), l.date().toString(),
                    l.startTime().toString(), l.durationMinutes(), l.startsAtUtc().toString(), l.coachTz());
        }
    }

    /**
     * A lesson on My bookings: the family's share of the price, and the lesson's own notice period. {@code share}: who it's
     * shared with (Batch 11), as far as the family may know.
     */
    public record MyLessonDto(String coachId, String coachFirstName, String studentId, String studentName, String date,
                              String startTime, int durationMinutes, String startsAtUtc, String coachTz, Integer priceMinor,
                              String currency, int requiredNoticeHours, String attendance, String recurrenceId, int intervalWeeks,
                              ShareDto share) {
        public static MyLessonDto of(BookingService.MyLesson m) {
            BookingService.FamilyLesson l = m.lesson();
            BookingService.ShareView s = m.share();
            return new MyLessonDto(l.coachId(), l.coachFirstName(), l.studentId(), l.studentName(), l.date().toString(),
                    l.startTime().toString(), l.durationMinutes(), l.startsAtUtc().toString(), l.coachTz(), m.priceMinor(),
                    m.currency(), m.requiredNoticeHours(), m.attendance(), m.recurrenceId(), m.intervalWeeks(),
                    new ShareDto(s.partnerName(), s.partnerStatus(), s.inviteId(), s.answerBy() == null ? null : s.answerBy().toString(),
                            s.fullPriceMinor(), s.shareable(), s.freedPlace(), s.joined()));
        }
    }

    /**
     * {@code partnerStatus}: INVITED, BOOKED, CHECKED_IN, NO_SHOW, LEFT (left in time, waiting for this family's answer by
     * {@code answerBy}), or how an invitation ended: DECLINED, WITHDRAWN, EXPIRED. {@code inviteId}: this family's own
     * invitation, to withdraw it.
     */
    public record ShareDto(String partnerName, String partnerStatus, String inviteId, String answerBy, Integer fullPriceMinor,
                           boolean shareable, boolean freedPlace, boolean joined) {
    }

    public record MyBookingsResponse(List<MyLessonDto> upcoming, List<MyLessonDto> recent, List<MySeriesDto> series) {
        public static MyBookingsResponse of(BookingService.MyBookings b) {
            return new MyBookingsResponse(b.upcoming().stream().map(MyLessonDto::of).toList(),
                    b.recent().stream().map(MyLessonDto::of).toList(), b.series().stream().map(MySeriesDto::of).toList());
        }
    }

    public record CancelBody(String coachId, String studentId, String date, String startTime) {
    }

    /**
     * {@code late}: inside the notice period, so the coach is told. {@code leave}: RELEASE, WITHDRAW (an unanswered invitation
     * ended with it), IN_TIME (the other family is asked) or LATE (the other skater keeps their share).
     */
    public record CancelResponse(String outcome, boolean late, String coachFirstName, String studentName, String date, String startTime,
                                 String leave) {
        public static CancelResponse of(CancellationService.FamilyCancel c) {
            return new CancelResponse(c.outcome().name(), c.late(), c.coachFirstName(), c.studentName(), c.date().toString(),
                    c.startTime().toString(), c.leave().name());
        }
    }

    public record PageResponse(String coachFirstName, String coachLastName, String coachTimezone, int requiredNoticeHours,
                               String today, String now, String windowFirst, String windowLast, boolean hasSchedule,
                               List<TimeDto> times, List<LessonDto> familyLessons, List<SpecialDto> specials) {
        public static PageResponse of(BookingService.BookingPage p) {
            return new PageResponse(p.coachFirstName(), p.coachLastName(), p.coachTimezone(), p.requiredNoticeHours(),
                    p.today().toString(), p.now().toString(), p.windowFirst().toString(), p.windowLast().toString(), p.hasSchedule(),
                    p.times().stream().map(t -> new TimeDto(t.date().toString(), t.startTime().toString(), t.endTime().toString(),
                            t.durationMinutes(), t.priceMinor(), t.currency(), t.blockSeq(), t.blockName(), t.free(), t.started(), t.shareable())).toList(),
                    p.familyLessons().stream().map(LessonDto::of).toList(),
                    p.specials().stream().map(x -> new SpecialDto(x.kind(), x.name(), x.startDate().toString(), x.endDate().toString())).toList());
        }
    }

    /** The coach's time off ({@code TIME_OFF}) or special schedule ({@code SPECIAL}): the day view says so (G-24). */
    public record SpecialDto(String kind, String name, String startDate, String endDate) {
    }

    public record PickBody(String date, String startTime) {
    }

    /** One request per coach (ADR-025 d3). The website makes {@code idempotencyKey} and resends it on a retry. */
    /** {@code repeat}: each pick repeats every {@code everyWeeks} weeks up to {@code until} (Batch 9). */
    /** {@code shareCode}: share every pick that can be shared with that skater (Batch 11); blank books them private. */
    public record BookBody(String coachId, String studentId, String idempotencyKey, List<PickBody> picks, Boolean repeat,
                           Integer everyWeeks, String until, String shareCode) {
        public BookingRequest toRequest() {
            List<BookingRequest.PickInput> in = picks == null ? null
                    : picks.stream().map(p -> p == null ? null : new BookingRequest.PickInput(p.date(), p.startTime())).toList();
            return BookingRequest.parse(coachId, studentId, idempotencyKey, in, repeat, everyWeeks, until);
        }
    }

    /** One repeating pick's series. {@code weekday}: MONDAY…SUNDAY. */
    public record SeriesDto(String recurrenceId, String weekday, String startTime, int intervalWeeks, String first, String until) {
        public static SeriesDto of(BookingService.Series s) {
            return new SeriesDto(s.recurrenceId(), s.weekday().name(), s.startTime().toString(), s.intervalWeeks(), s.first().toString(),
                    s.until().toString());
        }
    }

    /** A series still running on My bookings. */
    public record MySeriesDto(String coachId, String recurrenceId, String studentId, String studentName, String coachFirstName,
                              String weekday, String startTime, int intervalWeeks, String endDate, int lessonsLeft, String lastLesson) {
        public static MySeriesDto of(BookingService.SeriesView v) {
            return new MySeriesDto(v.recurrence().coachId(), v.recurrence().recurrenceId(), v.recurrence().studentId(), v.studentName(),
                    v.coachFirstName(), v.recurrence().weekday().name(), v.recurrence().startTime().toString(), v.recurrence().intervalWeeks(),
                    v.recurrence().endDate().toString(), v.lessonsLeft(), v.lastLesson().toString());
        }
    }

    /** {@code change}: END_EARLIER (with {@code endDate}), LESS_OFTEN (with {@code intervalWeeks}) or STOP. */
    public record SeriesChangeBody(String coachId, String recurrenceId, String change, String endDate, Integer intervalWeeks) {
    }

    public record SeriesChangedDto(int cancelled, boolean late, String coachFirstName, String studentName, String endDate, int intervalWeeks,
                                   String status) {
        public static SeriesChangedDto of(com.bladebook.core.service.RecurrenceService.Changed c) {
            return new SeriesChangedDto(c.cancelled(), c.late(), c.coachFirstName(), c.studentName(), c.after().endDate().toString(),
                    c.after().intervalWeeks(), c.after().status().name());
        }
    }

    /** {@code message} only for an unavailable date: the one wording for every cause (B1). */
    public record PickResultDto(String date, String startTime, String outcome, String message, Integer durationMinutes,
                                Integer priceMinor, String currency, String recurrenceId) {
    }

    /** {@code shared}: what the share code did, or null. */
    public record BookResponse(String coachFirstName, String studentName, List<PickResultDto> picks, List<SeriesDto> series,
                               SharedDto shared) {
        public static BookResponse of(BookingService.BookingResult r) {
            return new BookResponse(r.coachFirstName(), r.studentName(), r.picks().stream().map(p -> new PickResultDto(
                    p.date().toString(), p.startTime().toString(), p.outcome().name(),
                    p.outcome() == BookingOutcome.UNAVAILABLE ? BookingOutcome.UNAVAILABLE_MESSAGE : null,
                    p.durationMinutes(), p.priceMinor(), p.currency(), p.recurrenceId())).toList(),
                    r.series().stream().map(SeriesDto::of).toList(),
                    r.shared() == null ? null : new SharedDto(r.shared().displayName(), r.shared().sibling(), r.shared().lessons()));
        }
    }

    /** An invitation sent to another family's skater ({@code sibling} false), or a sibling added directly. */
    public record SharedDto(String displayName, boolean sibling, int lessons) {
    }
}
