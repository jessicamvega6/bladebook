package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.ClientContext;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** consumer-family-sync: a family's contact change reaches every coach (ADR-MASTER section 5). */
class FamilySyncServiceTest {

    @Test
    void aContactChangeReachesEachCoach() {
        FamilyTestSupport t = new FamilyTestSupport();
        AccessContext dana = t.coach("Dana", "7K2Q-M9XT");
        AccessContext ben = t.coach("Ben", "4R8T-WH6C");
        ClientContext family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com",
                FamilyTestSupport.guardian(List.of("7K2Q-M9XT", "4R8T-WH6C"), FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT", "4R8T-WH6C")));
        t.familyService.updateContact(family, "Sara", "Park", "(205) 555-0100");

        assertThat(t.familySync.familyChanged(family.clientId())).isEqualTo(2);
        assertThat(t.studentRepo.list(dana).get(0).clientName()).isEqualTo("Sara Park");
        assertThat(t.studentRepo.list(ben).get(0).clientPhone()).isEqualTo("(205) 555-0100");
    }

    @Test
    void aFamilyThatIsGoneChangesNothing() {
        assertThat(new FamilyTestSupport().familySync.familyChanged("no-such-family")).isZero();
    }
}
