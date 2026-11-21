package com.bladebook.core.service;

import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.domain.CoachName;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Step 1 of family sign-up: the code is checked as it's typed (FeatureDecriptions/Client Sign Up). */
class CodeLookupServiceTest {

    private FamilyTestSupport t;
    private CodeLookupService lookup;

    @BeforeEach
    void setUp() {
        t = new FamilyTestSupport();
        lookup = new CodeLookupService(new CodeRepository(t.f.clients, t.f.table));
        t.coach("Dana", "7K2Q-M9XT");
    }

    @Test
    void aCodeInAnyCaseWithOrWithoutTheDashFindsTheCoach() {
        assertThat(lookup.lookup("7k2q-m9xt")).contains(new CoachName("Dana", "Whitfield"));
        assertThat(lookup.lookup(" 7K2QM9XT ")).contains(new CoachName("Dana", "Whitfield"));
    }

    @Test
    void aCodeThatCantBeACoachCodeFindsNobody() {
        assertThat(lookup.lookup("MIA-4K7QX")).isEmpty();
        assertThat(lookup.lookup("0000-0000")).isEmpty();
        assertThat(lookup.lookup(null)).isEmpty();
    }

    @Test
    void anUnusedCodeFindsNobody() {
        assertThat(lookup.lookup("AAAA-AAAA")).isEmpty();
    }
}
