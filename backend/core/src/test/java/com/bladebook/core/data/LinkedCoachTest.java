package com.bladebook.core.data;

import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A coach the family is linked to, made only by core.data from the family's own link items (section 16). */
class LinkedCoachTest {

    @Test
    void knowsWhetherTheCoachHasApprovedTheFamily() {
        assertThat(new LinkedCoach("dana", StudentStatus.ACTIVE).active()).isTrue();
        assertThat(new LinkedCoach("dana", StudentStatus.PENDING).active()).isFalse();
    }
}
