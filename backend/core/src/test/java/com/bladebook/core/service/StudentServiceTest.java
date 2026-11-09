package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The coach's Students and Waiting for approval tabs (design: coach/screens-students.js). */
class StudentServiceTest {

    private FamilyTestSupport t;
    private AccessContext dana;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        dana = t.coach("Dana", "7K2Q-M9XT");
        t.registration.register(FamilyTestSupport.newFamily(), "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT"), FamilyTestSupport.kid("Jack Park", "7K2Q-M9XT"), FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
    }

    private List<String> ids() {
        return t.studentRepo.list(dana).stream().map(StudentRecord::studentId).toList();
    }

    @Test
    void theListsSplitWaitingFromApprovedAndSortByName() {
        String first = ids().get(0);
        t.students.approve(dana, List.of(first));

        StudentService.Lists l = t.students.list(dana);

        assertThat(l.active()).hasSize(1);
        assertThat(l.pending()).hasSize(1);
        assertThat(t.students.list(dana).active().get(0).status()).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void approveAllApprovesEverySkaterGiven() {
        List<StudentRecord> done = t.students.approve(dana, ids());

        assertThat(done).extracting(StudentRecord::status).containsOnly(StudentStatus.ACTIVE);
        assertThat(t.students.list(dana).active()).extracting(StudentRecord::studentName).containsExactly("Ava Park", "Jack Park");
    }

    @Test
    void approvingNeedsAtLeastOneAndAtMostFiftySkaters() {
        assertThatThrownBy(() -> t.students.approve(dana, List.of())).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> t.students.approve(dana, Collections.nCopies(51, "x"))).isInstanceOf(DomainException.class);
    }

    @Test
    void decliningRemovesTheSkater() {
        StudentRecord gone = t.students.decline(dana, ids().get(0));

        assertThat(gone.status()).isEqualTo(StudentStatus.PENDING);
        assertThat(t.students.list(dana).pending()).hasSize(1);
    }
}
