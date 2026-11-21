package com.bladebook.core.domain;

import com.bladebook.core.domain.BusinessEmails.Link;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The coach's business-email list: what can be added, resent, removed, chosen and confirmed (ADR-016, 2026-11-12). */
class BusinessEmailsTest {

    private static final String LOGIN = "dana@gmail.com";
    private static final Instant NOW = Instant.parse("2026-11-16T14:00:00Z");
    private static final String HASH = LinkToken.hash("token-one");

    private static BusinessEmails newCoach() {
        return new BusinessEmails(LOGIN, null, List.of(), Map.of());
    }

    private static BusinessEmails confirmedLogin() {
        return new BusinessEmails(LOGIN, LOGIN, List.of(), Map.of());
    }

    private static Link link(String hash, Instant sentAt) {
        return Link.sentAt(hash, sentAt);
    }

    // ---- links ----

    @Test
    void aLinkLastsThreeDaysFromWhenItWasSent() {
        Link l = link(HASH, NOW);
        assertThat(l.expiresAt()).isEqualTo(NOW.plus(Duration.ofDays(3)));
        assertThat(l.sentAt()).isEqualTo(NOW);
        assertThat(l.expired(NOW.plus(Duration.ofDays(3)).minusSeconds(1))).isFalse();
        assertThat(l.expired(NOW.plus(Duration.ofDays(3)))).isTrue();
    }

    @Test
    void aLinkFromBeforeBatch14HasNoTokenAndIsAlwaysExpired() {
        Link legacy = Link.none();
        assertThat(legacy.tokenHash()).isNull();
        assertThat(legacy.expired(Instant.EPOCH)).isTrue();
        assertThat(legacy.matches(LinkToken.hash("anything"))).isFalse();
    }

    // ---- add ----

    @Test
    void aNewAddressWaitsForItsLink() {
        BusinessEmails next = confirmedLogin().add("lessons@dana.com", link(HASH, NOW));
        assertThat(next.pending()).containsOnlyKeys("lessons@dana.com");
        assertThat(next.current()).isEqualTo(LOGIN); // families keep the current address until it's confirmed
        assertThat(next.confirmed()).isEmpty();
    }

    @Test
    void anAddressAlreadyOnTheListIsRefusedWhateverItsCase() {
        BusinessEmails b = confirmedLogin().add("lessons@dana.com", link(HASH, NOW));
        for (String again : List.of("Lessons@Dana.com", "DANA@gmail.com")) {
            assertThatThrownBy(() -> b.add(again, link(HASH, NOW)))
                    .isInstanceOf(DomainException.class)
                    .hasMessage("That address is already on your list.")
                    .extracting("field").isEqualTo("address");
        }
        BusinessEmails withConfirmed = new BusinessEmails(LOGIN, "club@dana.com", List.of("club@dana.com"), Map.of());
        assertThatThrownBy(() -> withConfirmed.add("CLUB@dana.com", link(HASH, NOW))).isInstanceOf(DomainException.class);
    }

    @Test
    void theListHoldsTenAddressesBesidesTheLoginEmail() {
        BusinessEmails b = confirmedLogin();
        for (int i = 0; i < BusinessEmails.MAX_ADDRESSES; i++) {
            b = b.add("a" + i + "@dana.com", link(HASH, NOW));
        }
        BusinessEmails full = b;
        assertThatThrownBy(() -> full.add("one-more@dana.com", link(HASH, NOW)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("up to 10");
    }

    // ---- resend ----

    @Test
    void resendReplacesTheLinkSoTheOldOneStopsWorking() {
        BusinessEmails b = confirmedLogin().add("lessons@dana.com", link(HASH, NOW));
        String newHash = LinkToken.hash("token-two");
        BusinessEmails next = b.resend("LESSONS@dana.com", link(newHash, NOW.plusSeconds(120)), NOW.plusSeconds(120));

        assertThat(next.pending().get("lessons@dana.com").tokenHash()).isEqualTo(newHash);
        assertThat(next.find(HASH, NOW.plusSeconds(120))).isEmpty();
        assertThat(next.find(newHash, NOW.plusSeconds(120))).contains("lessons@dana.com");
    }

    @Test
    void resendWithinAMinuteIsRefused() {
        BusinessEmails b = confirmedLogin().add("lessons@dana.com", link(HASH, NOW));
        assertThatThrownBy(() -> b.resend("lessons@dana.com", link(HASH, NOW.plusSeconds(59)), NOW.plusSeconds(59)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("a moment ago");
        assertThat(b.resend("lessons@dana.com", link(HASH, NOW.plusSeconds(60)), NOW.plusSeconds(60)).pending()).hasSize(1);
    }

    @Test
    void onlyAnAddressWaitingForItsLinkCanBeResent() {
        assertThatThrownBy(() -> confirmedLogin().resend(LOGIN, link(HASH, NOW), NOW))
                .isInstanceOf(DomainException.class)
                .extracting("reason").isEqualTo(DomainException.Reason.CONFLICT);
    }

    // ---- confirm ----

    @Test
    void aNewCoachsConfirmedAddressBecomesTheBusinessEmail() {
        BusinessEmails b = newCoach().add("lessons@dana.com", link(HASH, NOW));
        BusinessEmails next = b.confirm(HASH, NOW.plus(Duration.ofDays(2)));

        assertThat(next.current()).isEqualTo("lessons@dana.com");
        assertThat(next.pending()).isEmpty();
        assertThat(next.confirmed()).containsExactly("lessons@dana.com");
    }

    @Test
    void onTheProfileTheConfirmedAddressTakesOverAndTheOldOneStaysOnTheList() {
        BusinessEmails b = new BusinessEmails(LOGIN, "old@dana.com", List.of("old@dana.com"), Map.of())
                .add("new@dana.com", link(HASH, NOW));
        BusinessEmails next = b.confirm(HASH, NOW.plusSeconds(10));

        assertThat(next.current()).isEqualTo("new@dana.com");
        assertThat(next.confirmed()).containsExactly("old@dana.com", "new@dana.com");
    }

    @Test
    void anExpiredUsedOrUnknownLinkIsRefused() {
        BusinessEmails b = newCoach().add("lessons@dana.com", link(HASH, NOW));
        assertThatThrownBy(() -> b.confirm(HASH, NOW.plus(Duration.ofDays(3))))
                .isInstanceOf(DomainException.class)
                .hasMessage(BusinessEmails.LINK_DOESNT_WORK);
        assertThatThrownBy(() -> b.confirm(LinkToken.hash("someone else's"), NOW))
                .isInstanceOf(DomainException.class)
                .hasMessage(BusinessEmails.LINK_DOESNT_WORK);
        BusinessEmails used = b.confirm(HASH, NOW);
        assertThatThrownBy(() -> used.confirm(HASH, NOW)).hasMessage(BusinessEmails.LINK_DOESNT_WORK);
    }

    @Test
    void findLooksALinkUpWithoutUsingIt() {
        BusinessEmails b = newCoach().add("lessons@dana.com", link(HASH, NOW));
        assertThat(b.find(HASH, NOW)).contains("lessons@dana.com");
        assertThat(b.find(HASH, NOW)).contains("lessons@dana.com");
        assertThat(b.find(HASH, NOW.plus(Duration.ofDays(4)))).isEmpty();
        assertThat(b.find(null, NOW)).isEmpty();
    }

    // ---- choose ----

    @Test
    void anyConfirmedAddressOrTheLoginEmailCanBeChosen() {
        BusinessEmails b = new BusinessEmails(LOGIN, "club@dana.com", List.of("club@dana.com"), Map.of());
        assertThat(b.choose("DANA@gmail.com").current()).isEqualTo(LOGIN);
        assertThat(b.choose(LOGIN).choose("club@dana.com").current()).isEqualTo("club@dana.com");
    }

    @Test
    void anAddressWaitingForItsLinkCantBeChosen() {
        BusinessEmails b = confirmedLogin().add("lessons@dana.com", link(HASH, NOW));
        assertThatThrownBy(() -> b.choose("lessons@dana.com"))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("confirm")
                .extracting("field").isEqualTo("address");
        assertThatThrownBy(() -> b.choose("stranger@x.com")).isInstanceOf(DomainException.class);
    }

    // ---- remove ----

    @Test
    void aWaitingOrSpareConfirmedAddressCanBeRemoved() {
        BusinessEmails b = new BusinessEmails(LOGIN, LOGIN, List.of("spare@dana.com"), Map.of())
                .add("lessons@dana.com", link(HASH, NOW));
        BusinessEmails next = b.remove("Lessons@dana.com").remove("spare@dana.com");
        assertThat(next.pending()).isEmpty();
        assertThat(next.confirmed()).isEmpty();
        assertThat(next.find(HASH, NOW)).isEmpty(); // removing the address kills its link
    }

    @Test
    void theCurrentAddressAndTheLoginEmailStay() {
        BusinessEmails b = new BusinessEmails(LOGIN, "club@dana.com", List.of("club@dana.com"), Map.of());
        assertThatThrownBy(() -> b.remove("club@dana.com")).isInstanceOf(DomainException.class).hasMessageContaining("Choose another");
        assertThatThrownBy(() -> b.remove(LOGIN)).isInstanceOf(DomainException.class).hasMessageContaining("login email");
        assertThatThrownBy(() -> b.remove("never@x.com")).isInstanceOf(DomainException.class);
    }

    // ---- order ----

    @Test
    void theNewestWaitingAddressIsTheOneMostRecentlySent() {
        Map<String, Link> pending = new LinkedHashMap<>();
        pending.put("b@dana.com", link(HASH, NOW.plusSeconds(60)));
        pending.put("a@dana.com", link(HASH, NOW));
        BusinessEmails b = new BusinessEmails(LOGIN, null, List.of(), pending);
        assertThat(b.newestPending()).contains("b@dana.com");
        assertThat(newCoach().newestPending()).isEmpty();
    }
}
