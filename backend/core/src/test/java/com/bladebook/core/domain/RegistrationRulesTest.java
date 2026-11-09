package com.bladebook.core.domain;

import com.bladebook.core.domain.RegistrationRequest.SkaterRequest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Family registration (ADR-MASTER section 5, "Registration"; FeatureDecriptions/Client Sign Up). */
class RegistrationRulesTest {

    private static final String DANA = "7K2Q-M9XT";
    private static final String BEN = "4R8TWH6C";
    private static final RegistrationRules RULES = new RegistrationRules(RegistrationNumbers.withoutSeasonCheck());

    private static SkaterRequest skater(String name, String... codes) {
        return new SkaterRequest(name, "USFS", "1234567", List.of(codes));
    }

    private static RegistrationRequest guardian(List<String> codes, List<SkaterRequest> skaters) {
        return new RegistrationRequest("Sarah", "Park", "(205) 555-0196", "GUARDIAN", codes, skaters);
    }

    @Test
    void aGuardianRegistersTwoChildrenWithOneCoach() {
        Registration r = RULES.check(guardian(List.of(DANA), List.of(skater("Ava Park", DANA), skater(" Jack Park ", DANA))));

        assertThat(r.relationship()).isEqualTo(ClientRelationship.GUARDIAN);
        assertThat(r.coachCodes()).containsExactly(CoachCode.parse(DANA));
        assertThat(r.skaters()).extracting(NewSkater::name).containsExactly("Ava Park", "Jack Park");
        assertThat(r.skaters()).allSatisfy(s -> {
            assertThat(s.isMinor()).isTrue();
            assertThat(s.coachCodes()).containsExactly(CoachCode.parse(DANA));
        });
    }

    @Test
    void anAdultSkatesThemselvesUnderTheirOwnName() {
        RegistrationRequest req = new RegistrationRequest(" Priya ", "Shah", "205-555-0144", "SELF", List.of(DANA),
                List.of(new SkaterRequest("ignored", "USA_HOCKEY", "2027 kq48 15mx 3t", List.of(DANA))));

        Registration r = RULES.check(req);

        assertThat(r.firstName()).isEqualTo("Priya");
        NewSkater me = r.skaters().get(0);
        assertThat(me.name()).isEqualTo("Priya Shah");
        assertThat(me.isMinor()).isFalse();
        assertThat(me.skatingOrg()).isEqualTo(SkatingOrg.USA_HOCKEY);
        assertThat(me.registrationNumber()).isEqualTo("2027KQ4815MX3T");
    }

    @Test
    void anAdultSkatingThemselvesIsExactlyOneSkater() {
        RegistrationRequest req = new RegistrationRequest("Priya", "Shah", "205-555-0144", "SELF", List.of(DANA),
                List.of(skater("Priya Shah", DANA), skater("Raj Shah", DANA)));
        assertThatThrownBy(() -> RULES.check(req)).isInstanceOf(DomainException.class);
    }

    @Test
    void eachSkaterJoinsTheCoachesTheyTicked() {
        Registration r = RULES.check(guardian(List.of(DANA, BEN),
                List.of(skater("Ava Park", DANA, BEN), skater("Jack Park", BEN))));

        assertThat(r.coachCodes()).hasSize(2);
        assertThat(r.skaters().get(1).coachCodes()).containsExactly(CoachCode.parse(BEN));
    }

    @Test
    void theSameCoachTypedTwoWaysCountsOnce() {
        Registration r = RULES.check(guardian(List.of(DANA, "7k2qm9xt"), List.of(skater("Ava Park", DANA))));
        assertThat(r.coachCodes()).hasSize(1);
    }

    @Test
    void aSkaterMustPickAtLeastOneCoach() {
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), List.of(skater("Ava Park")))))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.getMessage()).isEqualTo("Pick at least one coach for Ava Park.");
                    assertThat(e.field()).isEqualTo("skaters.0.coachCodes");
                });
    }

    @Test
    void aSkaterCanOnlyPickCoachesFromThisSignUp() {
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), List.of(skater("Ava Park", BEN)))))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void aGuardianAddsAtLeastOneSkater() {
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), List.of())))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.getMessage()).isEqualTo("Add at least one skater."));
    }

    @Test
    void signUpNeedsOneToTenCoaches() {
        assertThatThrownBy(() -> RULES.check(guardian(List.of(), List.of(skater("Ava Park")))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("coachCodes"));
        List<String> eleven = new ArrayList<>();
        for (int i = 0; i < 11; i++) {
            eleven.add("AAAAAAA" + CoachCode.ALPHABET.charAt(i));
        }
        assertThatThrownBy(() -> RULES.check(guardian(eleven, List.of(skater("Ava Park", DANA)))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("coachCodes"));
    }

    @Test
    void aMalformedCoachCodeDoesNotMatchACoach() {
        assertThatThrownBy(() -> RULES.check(guardian(List.of("MIA-4K7QX"), List.of(skater("Ava Park", "MIA-4K7QX")))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.getMessage())
                        .isEqualTo("That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers."));
    }

    @Test
    void aBadNumberNamesTheSkaterField() {
        SkaterRequest bad = new SkaterRequest("Jack Park", "USA_HOCKEY", "2027", List.of(DANA));
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), List.of(skater("Ava Park", DANA), bad))))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.field()).isEqualTo("skaters.1.registrationNumber");
                    assertThat(e.getMessage()).isEqualTo("USA Hockey numbers are 14 characters: 9 digits and 5 letters.");
                });
    }

    @Test
    void aSkatersNameIsRequiredAndKeptShort() {
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), List.of(skater("  ", DANA)))))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.getMessage()).isEqualTo("Enter the skater’s full name.");
                    assertThat(e.field()).isEqualTo("skaters.0.name");
                });
        String long81 = String.join("", Collections.nCopies(81, "a"));
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), List.of(skater(long81, DANA)))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.getMessage()).isEqualTo("Keep the name to 80 characters."));
    }

    @Test
    void aMobileNumberIsRequired() {
        RegistrationRequest req = new RegistrationRequest("Sarah", "Park", " ", "GUARDIAN", List.of(DANA), List.of(skater("Ava Park", DANA)));
        assertThatThrownBy(() -> RULES.check(req))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.field()).isEqualTo("phone");
                    assertThat(e.getMessage()).isEqualTo("Enter a mobile phone number.");
                });
    }

    @Test
    void whoTheLessonsAreForMustBeChosen() {
        RegistrationRequest req = new RegistrationRequest("Sarah", "Park", "(205) 555-0196", null, List.of(DANA), List.of(skater("Ava Park", DANA)));
        assertThatThrownBy(() -> RULES.check(req))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.field()).isEqualTo("relationship"));
    }

    @Test
    void oneSignUpWritesAtMostOneHundredItems() {
        // 1 profile + 6 skaters + 2 items (link and STUDENT#) per skater per coach: 6 skaters x 8 coaches = 103.
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            codes.add("BBBBBBB" + CoachCode.ALPHABET.charAt(i));
        }
        String[] all = codes.toArray(new String[0]);
        List<SkaterRequest> six = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            six.add(skater("Skater " + i, all));
        }
        assertThatThrownBy(() -> RULES.check(guardian(codes, six)))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.getMessage())
                        .isEqualTo("That’s more than one sign-up can send. Send fewer skaters or coaches now; you can add the rest later."));
        assertThat(RegistrationRules.itemCount(6, 8 * 6)).isEqualTo(103);
    }

    @Test
    void aGuardianAddsAtMostTenSkaters() {
        List<SkaterRequest> eleven = new ArrayList<>();
        for (int i = 0; i < 11; i++) {
            eleven.add(skater("Skater " + i, DANA));
        }
        assertThatThrownBy(() -> RULES.check(guardian(List.of(DANA), eleven))).isInstanceOf(DomainException.class);
    }
}
