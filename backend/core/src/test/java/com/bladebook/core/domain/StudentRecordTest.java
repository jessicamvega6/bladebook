package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class StudentRecordTest {

    @Test
    void approvingChangesOnlyTheStatus() {
        StudentRecord r = new StudentRecord("dana", "ava", "sub", StudentStatus.PENDING, "Ava Park", true,
                ClientRelationship.GUARDIAN, "Sarah Park", "sarah@example.com", "2055550196", SkatingOrg.USFS, "1234567",
                Instant.EPOCH);

        StudentRecord approved = r.withStatus(StudentStatus.ACTIVE);

        assertThat(approved.status()).isEqualTo(StudentStatus.ACTIVE);
        assertThat(approved.withStatus(StudentStatus.PENDING)).isEqualTo(r);
    }
}
