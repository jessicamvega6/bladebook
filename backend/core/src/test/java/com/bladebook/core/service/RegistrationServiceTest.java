package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.domain.ClientRelationship;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.RegistrationRequest;
import com.bladebook.core.domain.RegistrationRequest.SkaterRequest;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.service.FamilyService.FamilyView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Registration (ADR-MASTER section 5): codes resolved again, a PENDING record per skater per coach. */
class RegistrationServiceTest {

    private FamilyTestSupport t;
    private AccessContext dana;
    private AccessContext ben;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        dana = t.coach("Dana", "7K2Q-M9XT");
        ben = t.coach("Ben", "4R8T-WH6C");
    }

    @Test
    void aGuardianWithTwoCoachesWaitsForEach() {
        ClientContext family = FamilyTestSupport.newFamily();

        FamilyView v = t.registration.register(family, "sarah@example.com", FamilyTestSupport.guardian(List.of("7K2Q-M9XT", "4r8twh6c"),
                FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT", "4R8T-WH6C"), FamilyTestSupport.kid("Jack Park", "4R8T-WH6C")));

        assertThat(v.waiting()).isTrue();
        assertThat(v.contact().email()).isEqualTo("sarah@example.com");
        assertThat(v.coaches()).extracting(FamilyService.CoachView::firstName).containsExactly("Ben", "Dana"); // by name
        assertThat(v.coaches().get(0).waitingNames()).containsExactly("Ava Park", "Jack Park");
        assertThat(t.studentRepo.list(dana)).extracting(StudentRecord::studentName).containsExactly("Ava Park");
        assertThat(t.studentRepo.list(ben)).hasSize(2).allSatisfy(r -> assertThat(r.status()).isEqualTo(StudentStatus.PENDING));
    }

    @Test
    void anAdultSkatesThemselves() {
        RegistrationRequest me = new RegistrationRequest("Priya", "Shah", "205-555-0144", "SELF", List.of("7K2Q-M9XT"),
                List.of(new SkaterRequest(null, "USA_HOCKEY", "2027KQ4815MX3T", List.of("7K2Q-M9XT"))));

        FamilyView v = t.registration.register(FamilyTestSupport.newFamily(), "priya@example.com", me);

        assertThat(v.contact().relationship()).isEqualTo(ClientRelationship.SELF);
        assertThat(v.skaters()).singleElement().satisfies(s -> {
            assertThat(s.name()).isEqualTo("Priya Shah");
            assertThat(s.isMinor()).isFalse();
        });
        StudentRecord r = t.studentRepo.list(dana).get(0);
        assertThat(r.relationship()).isEqualTo(ClientRelationship.SELF);
        assertThat(r.registrationNumber()).isEqualTo("2027KQ4815MX3T");
    }

    @Test
    void aCodeNoCoachHoldsStopsRegistrationAndWritesNothing() {
        ClientContext family = FamilyTestSupport.newFamily();
        assertThatThrownBy(() -> t.registration.register(family, "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT", "AAAA-AAAA"), FamilyTestSupport.kid("Ava Park", "AAAA-AAAA"))))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.field()).isEqualTo("coachCodes");
                    assertThat(e.getMessage()).isEqualTo("That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.");
                });
        assertThat(t.families.account(family)).isEmpty();
        assertThat(t.studentRepo.list(dana)).isEmpty();
    }

    @Test
    void registeringASecondTimeIsAConflict() {
        ClientContext family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com", FamilyTestSupport.guardian(List.of("7K2Q-M9XT"), FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));

        assertThatThrownBy(() -> t.registration.register(family, "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT"), FamilyTestSupport.kid("Lily Park", "7K2Q-M9XT"))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.CONFLICT));
    }

    @Test
    void theSignUpTimeIsStampedOnEachRecord() {
        t.registration.register(FamilyTestSupport.newFamily(), "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT"), FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
        assertThat(t.studentRepo.list(dana).get(0).signedUpAt()).isEqualTo(FamilyTestSupport.NOW);
    }
}
