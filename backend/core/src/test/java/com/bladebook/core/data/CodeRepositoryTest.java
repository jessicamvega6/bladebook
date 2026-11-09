package com.bladebook.core.data;

import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachName;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The coach-code lookup: before sign-in, names only; inside a family's session, the coach too (section 16). */
class CodeRepositoryTest {

    private DynamoDbLocal.Fixture f;
    private CodeRepository codes;
    private AccessContext dana;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        codes = new CodeRepository(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
    }

    @Test
    void beforeSignInACodeGivesOnlyTheCoachsName() {
        assertThat(codes.lookup(CoachCode.parse("7k2qm9xt"))).contains(new CoachName("Dana", "Whitfield"));
    }

    @Test
    void anUnknownCodeFindsNobody() {
        assertThat(codes.lookup(CoachCode.parse("AAAA-AAAA"))).isEmpty();
    }

    @Test
    void signedInTheCodeResolvesToTheCoach() {
        ClientContext family = new ClientContext(UUID.randomUUID().toString());
        CodeRepository.Found found = codes.resolve(family, CoachCode.parse("7K2Q-M9XT")).orElseThrow();
        assertThat(found.coachId()).isEqualTo(dana.coachId());
        assertThat(found.name().firstName()).isEqualTo("Dana");
    }
}
