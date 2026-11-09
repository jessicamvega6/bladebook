package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.domain.BlockTemplate;
import com.bladebook.core.domain.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import static com.bladebook.core.service.ScheduleTestSupport.days;
import static com.bladebook.core.service.ScheduleTestSupport.mondayMornings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Reading and saving the weekly schedule (ADR-008). Writing lesson times is ScheduleChangeService's. */
class ScheduleServiceTest {

    private ScheduleService service;
    private CoachRepository coaches;
    private AccessContext ctx;

    @BeforeEach
    void setUp() {
        DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
        coaches = new CoachRepository(f.clients, f.table);
        service = new ScheduleService(new ScheduleRepository(f.clients, f.table), coaches);
        ctx = new AccessContext(UUID.randomUUID().toString());
        ScheduleTestSupport.signUp(coaches, ctx);
    }

    @Test
    void aNewCoachHasNoScheduleAtVersionZero() {
        ScheduleService.ScheduleView v = service.schedule(ctx);
        assertThat(v.templates()).isEmpty();
        assertThat(v.scheduleVersion()).isZero();
        assertThat(v.exists()).isFalse();
    }

    @Test
    void savingReturnsTheTemplatesAsTheEditorWillReopenThem() {
        List<BlockTemplate> week = List.of(days(2, EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY), 15, 17), mondayMornings(5000));

        ScheduleService.ScheduleView saved = service.save(ctx, 0, week);

        assertThat(saved.scheduleVersion()).isEqualTo(1);
        assertThat(saved.exists()).isTrue();
        assertThat(saved.templates()).containsExactly(week.get(1), week.get(0));
        assertThat(service.schedule(ctx)).isEqualTo(saved);
    }

    @Test
    void everySaveGoesUpOneVersion() {
        service.save(ctx, 0, List.of(mondayMornings(5000)));
        assertThat(service.save(ctx, 1, List.of(mondayMornings(6000))).scheduleVersion()).isEqualTo(2);
    }

    @Test
    void aSaveFromAStaleEditorIsRefused() {
        service.save(ctx, 0, List.of(mondayMornings(5000)));
        service.save(ctx, 1, List.of(mondayMornings(6000)));
        assertThatThrownBy(() -> service.save(ctx, 1, List.of(mondayMornings(7000))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));
        assertThat(service.schedule(ctx).templates().get(0).priceMinor()).isEqualTo(6000);
    }

    @Test
    void anInvalidScheduleIsRefusedWithEveryProblemAndNothingIsWritten() {
        assertThatThrownBy(() -> service.save(ctx, 0, List.of(mondayMornings(5000), days(2, EnumSet.of(DayOfWeek.MONDAY), 7, 9))))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.field()).isEqualTo("blocks");
                    assertThat(e.getMessage()).isEqualTo("Monday: Morning ice (6–8 AM) and Block 2 (7–9 AM) overlap in time.");
                });
        assertThat(service.schedule(ctx).exists()).isFalse();
    }

    @Test
    void aNegativeVersionIsRefused() {
        assertThatThrownBy(() -> service.save(ctx, -1, List.of(mondayMornings(5000)))).isInstanceOf(DomainException.class);
    }

    @Test
    void aCoachWhoHasntFinishedSignUpCantSave() {
        AccessContext stranger = new AccessContext(UUID.randomUUID().toString());
        assertThatThrownBy(() -> service.save(stranger, 0, List.of(mondayMornings(5000))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NOT_FOUND));
    }
}
