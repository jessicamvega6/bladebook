package com.bladebook.core.data;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A skater the family is linked to and ACTIVE with, made only by ClientLinks (ADR-MASTER section 16). */
class LinkedSkaterTest {

    @Test
    void carriesTheSkaterTheirCoachAndAnActiveLinkedCoach() {
        LinkedSkater s = new LinkedSkater("family-1", "coach-1", "ava-1", "Ava Park", "Dana");
        assertThat(s.clientId()).isEqualTo("family-1");
        assertThat(s.coachId()).isEqualTo("coach-1");
        assertThat(s.studentId()).isEqualTo("ava-1");
        assertThat(s.studentName()).isEqualTo("Ava Park");
        assertThat(s.coachFirstName()).isEqualTo("Dana");
        assertThat(s.coach().coachId()).isEqualTo("coach-1");
        assertThat(s.coach().active()).isTrue();
    }

    @Test
    void itsTextNamesNoSkater() {
        assertThat(new LinkedSkater("family-1", "coach-1", "ava-1", "Ava Park", "Dana").toString()).doesNotContain("Ava");
    }
}
