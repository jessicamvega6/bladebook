package com.bladebook.core.data;

import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The writes the two event consumers make: consumer-student-link keeps a family's link in step with the
 * coach's STUDENT# record, and consumer-family-sync copies contact changes to every coach (section 5).
 */
class SyncRepositoryTest {

    private DynamoDbLocal.Fixture f;
    private SyncRepository sync;
    private FamilyRepository families;
    private StudentRepository students;
    private AccessContext dana;
    private Skater ava;
    private ClientContext family;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        sync = new SyncRepository(f.clients, f.table);
        families = new FamilyRepository(f.clients, f.table);
        students = new StudentRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        ava = FamilyTestData.skater("Ava Park");
        family = FamilyTestData.register(f, List.of(ava), dana);
    }

    @Test
    void theLinkFollowsAnApproval() {
        sync.setLinkStatus(family.clientId(), dana.coachId(), ava.studentId(), StudentStatus.ACTIVE);
        assertThat(families.account(family).orElseThrow().links().get(0).status()).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void aMissingLinkIsLeftMissing() {
        sync.deleteLink(family.clientId(), dana.coachId(), ava.studentId());
        sync.setLinkStatus(family.clientId(), dana.coachId(), ava.studentId(), StudentStatus.ACTIVE);
        assertThat(families.account(family).orElseThrow().links()).isEmpty();
    }

    @Test
    void theLinkFollowsADecline() {
        sync.deleteLink(family.clientId(), dana.coachId(), ava.studentId());
        FamilyAccount a = families.account(family).orElseThrow();
        assertThat(a.links()).isEmpty();
        assertThat(a.skaters()).containsExactly(ava); // the account and the skater stay
    }

    @Test
    void contactChangesReachEveryCoachsRecordOfTheFamilysSkaters() {
        families.updateContact(family, "Sara", "Park-Lee", "(205) 555-0100");
        FamilyAccount a = sync.account(family.clientId()).orElseThrow();

        int copied = sync.copyContact(a);

        StudentRecord r = students.list(dana).get(0);
        assertThat(copied).isEqualTo(1);
        assertThat(r.clientName()).isEqualTo("Sara Park-Lee");
        assertThat(r.clientPhone()).isEqualTo("(205) 555-0100");
    }

    @Test
    void contactIsCopiedOnlyOntoTheFamilysOwnRecords() {
        // Another family's skater under the same coach, but this family's link claims it.
        Skater other = FamilyTestData.skater("Owen Hart");
        FamilyTestData.register(f, List.of(other), dana);
        families.updateContact(family, "Sara", "Park-Lee", "(205) 555-0100");
        FamilyAccount a = sync.account(family.clientId()).orElseThrow();
        FamilyProfile p = a.profile();
        FamilyAccount forged = new FamilyAccount(p, a.skaters(), List.of(
                new com.bladebook.core.domain.SkaterLink(dana.coachId(), other.studentId(), "Owen Hart", StudentStatus.PENDING, "Dana", "Whitfield")));

        assertThat(sync.copyContact(forged)).isZero();
        assertThat(students.list(dana)).filteredOn(r -> r.studentId().equals(other.studentId()))
                .allSatisfy(r -> assertThat(r.clientName()).isEqualTo("Sarah Park"));
    }
}
