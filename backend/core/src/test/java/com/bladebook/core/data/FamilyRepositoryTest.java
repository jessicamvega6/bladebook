package com.bladebook.core.data;

import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.CoachPublicProfile;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.FamilyAccount;
import com.bladebook.core.domain.FamilyProfile;
import com.bladebook.core.domain.Skater;
import com.bladebook.core.domain.SkaterLink;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A family's own partition, and the PENDING STUDENT# records registration writes (ADR-MASTER section 5). */
class FamilyRepositoryTest {

    private DynamoDbLocal.Fixture f;
    private FamilyRepository families;
    private StudentRepository students;
    private AccessContext dana;
    private AccessContext ben;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        families = new FamilyRepository(f.clients, f.table);
        students = new StudentRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        ben = FamilyTestData.coach(f, "Ben", "4R8T-WH6C");
    }

    @Test
    void registeringWritesTheProfileSkatersLinksAndAPendingRecordPerSkaterPerCoach() {
        Skater ava = FamilyTestData.skater("Ava Park");
        Skater jack = FamilyTestData.skater("Jack Park");

        ClientContext family = FamilyTestData.register(f, List.of(ava, jack), dana, ben);

        FamilyAccount a = families.account(family).orElseThrow();
        assertThat(a.profile().fullName()).isEqualTo("Sarah Park");
        assertThat(a.skaters()).containsExactlyInAnyOrder(ava, jack);
        assertThat(a.links()).hasSize(4).allSatisfy(l -> {
            assertThat(l.status()).isEqualTo(StudentStatus.PENDING);
            assertThat(l.coachFirstName()).isEqualTo("Dana");
        });

        List<StudentRecord> danas = students.list(dana);
        assertThat(danas).extracting(StudentRecord::studentName).containsExactlyInAnyOrder("Ava Park", "Jack Park");
        StudentRecord r = danas.get(0);
        assertThat(r.status()).isEqualTo(StudentStatus.PENDING);
        assertThat(r.clientId()).isEqualTo(family.clientId());
        assertThat(r.clientName()).isEqualTo("Sarah Park");
        assertThat(r.clientEmail()).isEqualTo("sarah@example.com");
        assertThat(r.signedUpAt()).isEqualTo(FamilyTestData.SIGNED_UP);
        assertThat(students.list(ben)).hasSize(2);
    }

    @Test
    void registeringTwiceIsAConflictAndWritesNothingMore() {
        Skater ava = FamilyTestData.skater("Ava Park");
        ClientContext family = FamilyTestData.register(f, List.of(ava), dana);
        FamilyProfile p = FamilyTestData.profile(family);
        Skater lily = FamilyTestData.skater("Lily Park");

        assertThatThrownBy(() -> families.register(family, p, List.of(lily),
                List.of(FamilyTestData.pending(dana.coachId(), lily, p)), Map.of(dana.coachId(), new CoachName("Dana", "Whitfield"))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));

        assertThat(families.account(family).orElseThrow().skaters()).containsExactly(ava);
        assertThat(students.list(dana)).hasSize(1);
    }

    @Test
    void aFamilyThatHasntRegisteredHasNoAccount() {
        assertThat(families.account(new ClientContext(UUID.randomUUID().toString()))).isEmpty();
    }

    @Test
    void aWaitingCoachsProfileCantBeRead() {
        ClientContext family = FamilyTestData.register(f, List.of(FamilyTestData.skater("Ava Park")), dana);

        LinkedCoach waiting = families.linkedCoaches(family).get(0);

        assertThat(waiting.active()).isFalse();
        assertThat(families.coachProfile(family, waiting)).isEmpty();
    }

    @Test
    void anApprovedCoachsPublicFieldsCanBeRead() {
        Skater ava = FamilyTestData.skater("Ava Park");
        ClientContext family = FamilyTestData.register(f, List.of(ava), dana);
        new SyncRepository(f.clients, f.table).setLinkStatus(family.clientId(), dana.coachId(), ava.studentId(), StudentStatus.ACTIVE);

        LinkedCoach approved = families.linkedCoaches(family).get(0);
        CoachPublicProfile p = families.coachProfile(family, approved).orElseThrow();

        assertThat(approved.active()).isTrue();
        assertThat(p.firstName()).isEqualTo("Dana");
        assertThat(p.shownPhone()).isEqualTo("(205) 555-0142");
        assertThat(p.shownEmail()).isNull();
    }

    @Test
    void contactDetailsChangeOnTheFamilysOwnProfile() {
        ClientContext family = FamilyTestData.register(f, List.of(FamilyTestData.skater("Ava Park")), dana);

        families.updateContact(family, "Sara", "Park-Lee", "(205) 555-0100");

        FamilyProfile p = families.account(family).orElseThrow().profile();
        assertThat(p.fullName()).isEqualTo("Sara Park-Lee");
        assertThat(p.phone()).isEqualTo("(205) 555-0100");
        assertThat(p.email()).isEqualTo("sarah@example.com");
    }

    @Test
    void contactDetailsNeedAnAccount() {
        assertThatThrownBy(() -> families.updateContact(new ClientContext(UUID.randomUUID().toString()), "A", "B", "2055550100"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NOT_FOUND));
    }

    @Test
    void linksReadBackAsLinks() {
        Skater ava = FamilyTestData.skater("Ava Park");
        ClientContext family = FamilyTestData.register(f, List.of(ava), dana);
        SkaterLink l = families.account(family).orElseThrow().links().get(0);
        assertThat(l.coachId()).isEqualTo(dana.coachId());
        assertThat(l.studentId()).isEqualTo(ava.studentId());
        assertThat(l.studentName()).isEqualTo("Ava Park");
    }
}
