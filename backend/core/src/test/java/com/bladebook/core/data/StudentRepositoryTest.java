package com.bladebook.core.data;

import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The coach's STUDENT# records: list, approve, decline (ADR-MASTER section 5, "Approval"). */
class StudentRepositoryTest {

    private DynamoDbLocal.Fixture f;
    private StudentRepository students;
    private AccessContext dana;
    private Skater ava;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        students = new StudentRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        ava = FamilyTestData.skater("Ava Park");
        FamilyTestData.register(f, List.of(ava), dana);
    }

    @Test
    void aCoachSeesOnlyTheirOwnStudents() {
        AccessContext ben = FamilyTestData.coach(f, "Ben", "4R8T-WH6C");
        assertThat(students.list(ben)).isEmpty();
        assertThat(students.list(dana)).extracting(StudentRecord::studentId).containsExactly(ava.studentId());
    }

    @Test
    void approvingMakesTheSkaterActive() {
        StudentRecord r = students.approve(dana, ava.studentId());

        assertThat(r.status()).isEqualTo(StudentStatus.ACTIVE);
        assertThat(students.list(dana).get(0).status()).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void approvingTwiceIsHarmless() {
        students.approve(dana, ava.studentId());
        assertThat(students.approve(dana, ava.studentId()).status()).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void decliningDeletesTheRecordAndReturnsWhatItHeld() {
        StudentRecord gone = students.decline(dana, ava.studentId());

        assertThat(gone.clientEmail()).isEqualTo("sarah@example.com");
        assertThat(students.list(dana)).isEmpty();
    }

    @Test
    void anApprovedSkaterCantBeDeclined() {
        students.approve(dana, ava.studentId());
        assertThatThrownBy(() -> students.decline(dana, ava.studentId()))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));
        assertThat(students.list(dana)).hasSize(1);
    }

    @Test
    void aSkaterWhoIsntThereIsAConflictEitherWay() {
        AccessContext ben = FamilyTestData.coach(f, "Ben", "4R8T-WH6C");
        assertThatThrownBy(() -> students.approve(ben, ava.studentId()))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));
        assertThatThrownBy(() -> students.decline(ben, ava.studentId()))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));
        assertThat(students.list(dana)).hasSize(1);
    }

    @Test
    void anIdThatCouldEscapeTheKeyIsRefused() {
        assertThatThrownBy(() -> students.approve(dana, "x#PROFILE"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.INVALID));
    }
}
