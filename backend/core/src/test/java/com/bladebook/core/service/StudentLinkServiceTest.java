package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ClientContext;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** consumer-student-link: the family's link follows the coach's STUDENT# record (ADR-MASTER section 5). */
class StudentLinkServiceTest {

    private FamilyTestSupport t;
    private AccessContext dana;
    private ClientContext family;
    private StudentRecord ava;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        dana = t.coach("Dana", "7K2Q-M9XT");
        family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT"), FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
        ava = t.studentRepo.list(dana).get(0);
    }

    @Test
    void anApprovalReachesTheFamily() {
        t.links.approved(t.studentRepo.approve(dana, ava.studentId()));
        assertThat(t.families.account(family).orElseThrow().links().get(0).status()).isEqualTo(StudentStatus.ACTIVE);
    }

    @Test
    void aDeclineRemovesTheLinkButKeepsTheAccount() {
        t.links.declined(t.studentRepo.decline(dana, ava.studentId()));

        assertThat(t.families.account(family).orElseThrow().links()).isEmpty();
        assertThat(t.families.account(family).orElseThrow().skaters()).hasSize(1);
    }
}
