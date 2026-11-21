package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.StudentStatus;
import com.bladebook.core.service.FamilyService.CoachView;
import com.bladebook.core.service.FamilyService.FamilyView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** What Home and Profile show a family, waiting or approved (ADR-MASTER section 5; ClientHomeView). */
class FamilyServiceTest {

    private FamilyTestSupport t;
    private AccessContext dana;
    private ClientContext family;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        dana = t.coach("Dana", "7K2Q-M9XT");
        family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT"), FamilyTestSupport.kid("Jack Park", "7K2Q-M9XT"), FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
    }

    private void approve(String name) {
        t.studentRepo.list(dana).stream().filter(r -> r.studentName().equals(name)).forEach(r ->
                t.links.approved(t.studentRepo.approve(dana, r.studentId())));
    }

    @Test
    void aWaitingFamilySeesTheCoachsNameButNothingElse() {
        FamilyView v = t.familyService.view(family);

        assertThat(v.waiting()).isTrue();
        CoachView c = v.coaches().get(0);
        assertThat(c.firstName()).isEqualTo("Dana");
        assertThat(c.status()).isEqualTo(StudentStatus.PENDING);
        assertThat(c.details()).isNull();
    }

    @Test
    void skatersAreListedByNameWithTheirStatusWithEachCoach() {
        FamilyView v = t.familyService.view(family);
        assertThat(v.skaters()).extracting(FamilyService.SkaterView::name).containsExactly("Ava Park", "Jack Park");
        assertThat(v.skaters().get(0).coaches()).singleElement()
                .satisfies(s -> assertThat(s.status()).isEqualTo(StudentStatus.PENDING));
    }

    @Test
    void oneApprovalEndsTheWaitAndOpensTheCoachsDetails() {
        approve("Ava Park");

        FamilyView v = t.familyService.view(family);

        assertThat(v.waiting()).isFalse();
        CoachView c = v.coaches().get(0);
        assertThat(c.status()).isEqualTo(StudentStatus.ACTIVE);
        assertThat(c.waitingNames()).containsExactly("Jack Park");
        assertThat(c.details().shownPhone()).isEqualTo("(205) 555-0142");
        assertThat(c.details().shownEmail()).isNull();
        assertThat(c.details().payments().handle(com.bladebook.core.domain.PaymentTypes.Type.VENMO)).contains("@dana-skates");
    }

    @Test
    void contactDetailsAreCheckedAndSaved() {
        FamilyView v = t.familyService.updateContact(family, " Sara ", "Park-Lee", "(205) 555-0100");
        assertThat(v.contact().firstName()).isEqualTo("Sara");

        assertThatThrownBy(() -> t.familyService.updateContact(family, "Sara", "Park", ""))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("phone"));
        assertThatThrownBy(() -> t.familyService.updateContact(family, "", "Park", "(205) 555-0100"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("firstName"));
    }

    @Test
    void aFamilyThatHasntSignedUpIsNotFound() {
        assertThatThrownBy(() -> t.familyService.view(FamilyTestSupport.newFamily()))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.reason()).isEqualTo(DomainException.Reason.NOT_FOUND));
    }
}
