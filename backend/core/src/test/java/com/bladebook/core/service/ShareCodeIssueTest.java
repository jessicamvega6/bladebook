package com.bladebook.core.service;

import com.bladebook.core.data.ClientContext;
import com.bladebook.core.data.ShareRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** consumer-family-sync issues each new skater's share code (ADR-MASTER sections 3 and 5; G-17). */
class ShareCodeIssueTest {

    @Test
    void everySkaterGetsACodeThatMatchesTheirName() {
        FamilyTestSupport t = new FamilyTestSupport();
        t.coach("Dana", "7K2Q-M9XT");
        ClientContext family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com", FamilyTestSupport.guardian(List.of("7K2Q-M9XT"),
                FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT"), FamilyTestSupport.kid("Jack Park", "7K2Q-M9XT")));

        assertThat(t.familySync.issueShareCodes(family.clientId())).isEqualTo(2);

        var skaters = t.familyService.view(family).skaters();
        assertThat(skaters).extracting(FamilyService.SkaterView::shareCode)
                .anyMatch(c -> c.matches("AVA-[A-Z0-9]{5}")).anyMatch(c -> c.matches("JAC-[A-Z0-9]{5}"));
    }

    @Test
    void aCodeNeverChangesOnceIssued() {
        FamilyTestSupport t = new FamilyTestSupport();
        t.coach("Dana", "7K2Q-M9XT");
        ClientContext family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com", FamilyTestSupport.guardian(List.of("7K2Q-M9XT"),
                FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
        t.familySync.issueShareCodes(family.clientId());
        String first = t.familyService.view(family).skaters().get(0).shareCode();

        assertThat(t.familySync.issueShareCodes(family.clientId())).isZero();
        assertThat(t.familyService.view(family).skaters().get(0).shareCode()).isEqualTo(first);
    }

    @Test
    void theCodeLooksUpTheSkatersDisplayNameAndIdButNotAnotherShape() {
        FamilyTestSupport t = new FamilyTestSupport();
        t.coach("Dana", "7K2Q-M9XT");
        ClientContext family = FamilyTestSupport.newFamily();
        t.registration.register(family, "sarah@example.com", FamilyTestSupport.guardian(List.of("7K2Q-M9XT"),
                FamilyTestSupport.kid("Ava Park", "7K2Q-M9XT")));
        t.familySync.issueShareCodes(family.clientId());
        var ava = t.familyService.view(family).skaters().get(0);

        ShareRepository shares = new ShareRepository(t.f.clients, t.f.table);
        var found = shares.shareCode(ava.shareCode().toLowerCase().replace("-", ""));
        assertThat(found).isPresent();
        assertThat(found.get().studentId()).isEqualTo(ava.studentId());
        assertThat(found.get().displayName()).isEqualTo("Ava P.");
        assertThat(shares.shareCode("AVA-22222")).isEmpty();
        assertThat(shares.shareCode("7K2Q-M9XT")).isEmpty();
    }

    @Test
    void aFamilyThatIsGoneGetsNothing() {
        assertThat(new FamilyTestSupport().familySync.issueShareCodes("no-such-family")).isZero();
    }
}
