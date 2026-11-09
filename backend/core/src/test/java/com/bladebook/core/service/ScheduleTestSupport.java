package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachProfile;
import com.bladebook.core.domain.IceType;
import com.bladebook.core.domain.PaymentTypes;

import java.security.SecureRandom;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/** A signed-up Chicago coach and a few block templates for the schedule service tests. */
final class ScheduleTestSupport {

    private ScheduleTestSupport() {
    }

    static void signUp(CoachRepository coaches, AccessContext ctx) {
        coaches.create(ctx, CoachProfile.builder().coachId(ctx.coachId()).firstName("Dana").lastName("Whitfield")
                .loginEmail("dana@gmail.com").coachTimezone("America/Chicago").currency(CoachProfile.Currency.USD)
                .requiredNoticeHours(24).coachCode(CoachCode.generate(new SecureRandom())).payments(PaymentTypes.none())
                .build());
    }

    /** Mondays 6:00–8:00, 30 minutes, $50. */
    static BlockTemplate mondayMornings(int price) {
        return new BlockTemplate(1, "Morning ice", LocalTime.of(6, 0), LocalTime.of(8, 0), 30, price, 1,
                IceType.BFSC_FREESTYLE, EnumSet.of(DayOfWeek.MONDAY), Map.of());
    }

    static BlockTemplate days(int seq, Set<DayOfWeek> days, int startHour, int endHour) {
        return new BlockTemplate(seq, "", LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), 60, 8000, 2,
                IceType.PUBLIC, days, Map.of());
    }
}
