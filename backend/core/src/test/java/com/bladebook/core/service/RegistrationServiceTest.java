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

    // ------------------------------------------------ Profile: Add a skater and Add a coach (A9; ADR-025 d2, item k)

    private ClientContext parkWithAvaAtDana() {
        ClientContext park = FamilyTestSupport.newFamily();
        t.registration.register(park, "sarah@example.com", FamilyTestSupport.guardian(List.of("7K2Q-M9XT"),
                FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
        return park;
    }

    private static FamilyService.SkaterView skater(FamilyView v, String name) {
        return v.skaters().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    void anAddedSkaterWaitsForEachCoachPicked() {
        ClientContext park = parkWithAvaAtDana();
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));

        FamilyView v = t.registration.addSkater(park, new RegistrationService.AddSkater(" Lily Park ", "USFS", "3407715", List.of(dana.coachId()), false));

        assertThat(skater(v, "Lily Park").isMinor()).isTrue();
        assertThat(skater(v, "Lily Park").coaches()).singleElement().satisfies(c -> {
            assertThat(c.firstName()).isEqualTo("Dana");
            assertThat(c.status()).isEqualTo(StudentStatus.PENDING);
        });
        assertThat(t.studentRepo.list(dana)).extracting(StudentRecord::studentName).containsExactlyInAnyOrder("Ava Park", "Lily Park");
        assertThat(t.studentRepo.list(dana).stream().filter(r -> r.studentName().equals("Lily Park")).findFirst().orElseThrow().clientName())
                .isEqualTo("Sarah Park");
    }

    @Test
    void noneOfMyCoachesYetWritesTheSkaterAndNoCoachIsAsked() {
        ClientContext park = parkWithAvaAtDana();

        FamilyView v = t.registration.addSkater(park, new RegistrationService.AddSkater("Lily Park", "LEARN_TO_SKATE_USA", "3407715", List.of(), true));

        assertThat(skater(v, "Lily Park").coaches()).isEmpty();
        assertThat(t.studentRepo.list(dana)).hasSize(1);
        assertThat(t.studentRepo.list(ben)).isEmpty();
    }

    @Test
    void addingASkaterMustChooseCoachesOrNoneAndOnlyTheFamilysOwnCoaches() {
        ClientContext park = parkWithAvaAtDana();
        assertThatThrownBy(() -> t.registration.addSkater(park, new RegistrationService.AddSkater("Lily Park", "USFS", "3407715", List.of(), false)))
                .hasMessage("Pick each coach Lily Park will take lessons with, or “None of my coaches yet”.");
        assertThatThrownBy(() -> t.registration.addSkater(park, new RegistrationService.AddSkater("Lily Park", "USFS", "3407715", List.of(dana.coachId()), true)))
                .hasMessage("Pick coaches or “None of my coaches yet”, not both.");
        assertThatThrownBy(() -> t.registration.addSkater(park, new RegistrationService.AddSkater("Lily Park", "USFS", "3407715", List.of(ben.coachId()), false)))
                .hasMessage("Pick from your approved coaches. For any other coach, use Add a coach.");
        // Dana hasn't approved anyone yet, so she isn't offered either.
        assertThatThrownBy(() -> t.registration.addSkater(park, new RegistrationService.AddSkater("Lily Park", "USFS", "3407715", List.of(dana.coachId()), false)))
                .hasMessage("Pick from your approved coaches. For any other coach, use Add a coach.");
        assertThatThrownBy(() -> t.registration.addSkater(park, new RegistrationService.AddSkater(" ", "USFS", "3407715", List.of(), true)))
                .hasMessage("Enter the skater’s full name.");
        assertThatThrownBy(() -> t.registration.addSkater(park, new RegistrationService.AddSkater("ava park", "USFS", "3407715", List.of(), true)))
                .hasMessage("Ava Park is already on your account.");
        assertThat(t.familyService.view(park).skaters()).hasSize(1);
    }

    @Test
    void anAdultWhoSkatesThemselvesCantAddASkater() {
        ClientContext priya = FamilyTestSupport.newFamily();
        t.registration.register(priya, "priya@example.com", new RegistrationRequest("Priya", "Shah", "205-555-0144", "SELF",
                List.of("7K2Q-M9XT"), List.of(new SkaterRequest(null, "USA_HOCKEY", "2027KQ4815MX3T", List.of("7K2Q-M9XT")))));
        assertThatThrownBy(() -> t.registration.addSkater(priya, new RegistrationService.AddSkater("Lily Shah", "USFS", "3407715", List.of(), true)))
                .hasMessage("You skate yourself. To book for a child, they need their own family account.");
    }

    @Test
    void addingACoachLinksEachChosenSkaterToThatCoachAloneAndLeavesTheRestAlone() {
        ClientContext park = parkWithAvaAtDana();
        t.studentRepo.list(dana).forEach(r -> t.links.approved(t.studentRepo.approve(dana, r.studentId())));
        String lily = skater(t.registration.addSkater(park, new RegistrationService.AddSkater("Lily Park", "USFS", "3407715", List.of(), true)), "Lily Park").studentId();
        String ava = skater(t.familyService.view(park), "Ava Park").studentId();

        FamilyView v = t.registration.addCoach(park, "4r8t-wh6c", List.of(ava, lily));

        assertThat(skater(v, "Ava Park").coaches()).extracting(FamilyService.CoachStatus::firstName, FamilyService.CoachStatus::status)
                .containsExactlyInAnyOrder(org.assertj.core.groups.Tuple.tuple("Dana", StudentStatus.ACTIVE),
                        org.assertj.core.groups.Tuple.tuple("Ben", StudentStatus.PENDING));
        assertThat(skater(v, "Lily Park").coaches()).extracting(FamilyService.CoachStatus::firstName).containsExactly("Ben");
        assertThat(v.waiting()).isFalse(); // Dana approved Ava, so the family can still book with her
        assertThat(t.studentRepo.list(ben)).extracting(StudentRecord::studentName).containsExactlyInAnyOrder("Ava Park", "Lily Park");
    }

    @Test
    void addingACoachSkipsSkatersAlreadyWithThemAndRefusesWhenNoneAreLeft() {
        ClientContext park = parkWithAvaAtDana();
        String ava = skater(t.familyService.view(park), "Ava Park").studentId();
        assertThatThrownBy(() -> t.registration.addCoach(park, "7K2Q-M9XT", List.of(ava)))
                .hasMessage("Those skaters are already with Coach Dana.");
        assertThatThrownBy(() -> t.registration.addCoach(park, "4R8T-WH6K", List.of(ava)))
                .hasMessage("That code doesn’t match a coach. Check it with the coach who gave it to you. Codes are 8 letters and numbers.");
        assertThatThrownBy(() -> t.registration.addCoach(park, "4R8T-WH6C", List.of()))
                .hasMessage("Pick at least one skater for Coach Ben.");
        assertThatThrownBy(() -> t.registration.addCoach(park, "4R8T-WH6C", List.of(java.util.UUID.randomUUID().toString())))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NO_SUCH_ITEM));
        assertThat(t.studentRepo.list(ben)).isEmpty();
    }
}
