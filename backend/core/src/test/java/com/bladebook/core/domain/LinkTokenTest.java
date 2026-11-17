package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** The business-email link's token: random, and stored only as its SHA-256 hash (ADR-016, 2026-11-12). */
class LinkTokenTest {

    @Test
    void aTokenIs43UrlSafeCharactersAndNeverRepeats() {
        SecureRandom random = new SecureRandom();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            String t = LinkToken.random(random);
            assertThat(t).hasSize(43).matches("[A-Za-z0-9_-]+");
            assertThat(seen.add(t)).isTrue();
        }
    }

    @Test
    void theHashIsSha256InLowerCaseHex() {
        // echo -n abc | shasum -a 256
        assertThat(LinkToken.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(LinkToken.hash("abc")).isNotEqualTo(LinkToken.hash("abd"));
    }

    @Test
    void hashesCompareOnlyWhenBothAreThere() {
        String h = LinkToken.hash("abc");
        assertThat(LinkToken.same(h, LinkToken.hash("abc"))).isTrue();
        assertThat(LinkToken.same(h, LinkToken.hash("abd"))).isFalse();
        assertThat(LinkToken.same(null, h)).isFalse();
        assertThat(LinkToken.same(h, null)).isFalse();
    }

    @Test
    void aMissingOrOverlongTokenHasNoHash() {
        assertThat(LinkToken.hashOrNull(null)).isNull();
        assertThat(LinkToken.hashOrNull("  ")).isNull();
        assertThat(LinkToken.hashOrNull("x".repeat(LinkToken.MAX_LENGTH + 1))).isNull();
        assertThat(LinkToken.hashOrNull(" abc ")).isEqualTo(LinkToken.hash("abc"));
    }
}
