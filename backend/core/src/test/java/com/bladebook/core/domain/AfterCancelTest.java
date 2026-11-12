package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Release or hold (ADR-MASTER section 10, "By the coach"; S9). */
class AfterCancelTest {

    @Test
    void releasingTheLastSeatReopensTheTime() {
        assertThat(AfterCancel.RELEASE.lessonStatus(0)).isEqualTo(LessonTime.Status.OPEN);
    }

    @Test
    void holdingTheLastSeatClosesTheTime() {
        assertThat(AfterCancel.HOLD.lessonStatus(0)).isEqualTo(LessonTime.Status.HELD);
    }

    @Test
    void aTimeWithASeatLeftStaysBookedEitherWay() {
        assertThat(AfterCancel.RELEASE.lessonStatus(1)).isEqualTo(LessonTime.Status.BOOKED);
        assertThat(AfterCancel.HOLD.lessonStatus(1)).isEqualTo(LessonTime.Status.BOOKED);
    }

    @Test
    void theWebsitesWordsParse() {
        assertThat(AfterCancel.parse("RELEASE")).isEqualTo(AfterCancel.RELEASE);
        assertThat(AfterCancel.parse("HOLD")).isEqualTo(AfterCancel.HOLD);
    }

    @Test
    void anythingElseIsRefused() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> AfterCancel.parse("release"))
                .isInstanceOf(DomainException.class).hasMessage("Choose release or hold for each lesson.");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> AfterCancel.parse(null))
                .isInstanceOf(DomainException.class);
    }
}
