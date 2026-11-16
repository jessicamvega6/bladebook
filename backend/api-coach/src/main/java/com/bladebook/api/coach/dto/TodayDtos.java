package com.bladebook.api.coach.dto;

import com.bladebook.core.domain.TodayBoard;
import com.bladebook.core.service.TodayService;

import java.util.List;
import java.util.Map;

/** The Today page (Batch 22, G-6). Amounts are minor units, per currency; dates and times are the coach's local ones. */
public final class TodayDtos {

    private TodayDtos() {
    }

    /** {@code attendance}: BOOKED, CHECKED_IN, NO_SHOW or NOT_RECORDED. */
    public record SkaterDto(String studentId, String name, int amountMinor, String currency, String attendance) {
        static SkaterDto of(TodayBoard.Skater s) {
            return new SkaterDto(s.studentId(), s.name(), s.amountMinor(), s.currency(), s.shown().name());
        }
    }

    /** A booked lesson time with its skaters, or a held one ({@code held}, no skaters). */
    public record LessonDto(String startTime, int durationMinutes, boolean held, boolean next, List<SkaterDto> skaters) {
        static LessonDto of(TodayBoard.Lesson l) {
            return new LessonDto(l.time().startTime().toString(), l.time().durationMinutes(), l.held(), l.next(),
                    l.skaters().stream().map(SkaterDto::of).toList());
        }
    }

    /** {@code count}: skaters' lessons; {@code amounts}: per currency code. */
    public record FiguresDto(int count, Map<String, Long> amounts) {
        static FiguresDto of(TodayBoard.Figures f) {
            return new FiguresDto(f.count(), f.amounts());
        }
    }

    public record TodayDto(String coachTimezone, String currency, String today, String now, String weekStart, String weekEnd,
                           List<LessonDto> lessons, String nextLessonDate, FiguresDto week, FiguresDto unpaid) {
        public static TodayDto of(TodayService.View v) {
            return new TodayDto(v.coachTimezone(), v.currency(), v.today().toString(), v.now().toString(), v.weekStart().toString(),
                    v.weekEnd().toString(), v.lessons().stream().map(LessonDto::of).toList(),
                    v.nextLessonDate() == null ? null : v.nextLessonDate().toString(), FiguresDto.of(v.week()), FiguresDto.of(v.unpaid()));
        }
    }
}
