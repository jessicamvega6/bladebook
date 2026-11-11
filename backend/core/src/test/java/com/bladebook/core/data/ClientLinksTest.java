package com.bladebook.core.data;

import com.bladebook.core.domain.DomainException;
import com.bladebook.core.domain.Skater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The write link check (ADR-MASTER section 16): a {@link LinkedSkater} comes only from the family's own links,
 * and only for a skater linked and ACTIVE with that coach.
 */
class ClientLinksTest {

    private DynamoDbLocal.Fixture f;
    private ClientLinks links;
    private AccessContext dana;
    private AccessContext ben;
    private Skater ava;
    private Skater jack;
    private ClientContext family;

    @BeforeEach
    void setUp() {
        f = DynamoDbLocal.freshTable();
        links = new ClientLinks(f.clients, f.table);
        dana = FamilyTestData.coach(f, "Dana", "7K2Q-M9XT");
        ben = FamilyTestData.coach(f, "Ben", "4R8T-WH6C");
        ava = FamilyTestData.skater("Ava Park");
        jack = FamilyTestData.skater("Jack Park");
        family = FamilyTestData.register(f, List.of(ava, jack), dana);
        FamilyTestData.approve(f, dana, family, ava);
    }

    @Test
    void anActiveSkaterIsLinked() {
        LinkedSkater s = links.requireActive(family, dana.coachId(), ava.studentId());
        assertThat(s.studentId()).isEqualTo(ava.studentId());
        assertThat(s.studentName()).isEqualTo("Ava Park");
        assertThat(s.coachFirstName()).isEqualTo("Dana");
        assertThat(s.clientId()).isEqualTo(family.clientId());
    }

    @Test
    void aSkaterStillWaitingIsAConflictThatNamesTheSkaterAndCoach() {
        assertThatThrownBy(() -> links.requireActive(family, dana.coachId(), jack.studentId()))
                .isInstanceOf(DomainException.class)
                .hasMessage("Jack’s lessons are no longer available to book. Contact Coach Dana.")
                .extracting(e -> ((DomainException) e).reason()).isEqualTo(DomainException.Reason.CONFLICT);
    }

    @Test
    void aSkaterWithAnotherCoachIsNeverLinkedHere() {
        assertThatThrownBy(() -> links.requireActive(family, ben.coachId(), ava.studentId()))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).reason()).isEqualTo(DomainException.Reason.NO_SUCH_ITEM);
    }

    @Test
    void anotherFamilysSkaterIsAPlainNotFound() {
        Skater mia = FamilyTestData.skater("Mia Rossi");
        ClientContext other = FamilyTestData.register(f, List.of(mia), dana);
        FamilyTestData.approve(f, dana, other, mia);

        assertThatThrownBy(() -> links.requireActive(family, dana.coachId(), mia.studentId()))
                .isInstanceOf(DomainException.class)
                .hasMessage("That skater couldn’t be found. Reload the page.")
                .extracting(e -> ((DomainException) e).reason()).isEqualTo(DomainException.Reason.NO_SUCH_ITEM);
    }

    @Test
    void anIdThatCouldEscapeItsKeyIsRefusedBeforeAnyRead() {
        for (String bad : new String[] {null, "", "a#b", UUID.randomUUID() + "#x"}) {
            assertThatThrownBy(() -> links.requireActive(family, dana.coachId(), bad)).isInstanceOf(DomainException.class);
            assertThatThrownBy(() -> links.requireActive(family, bad, ava.studentId())).isInstanceOf(DomainException.class);
        }
    }
}
