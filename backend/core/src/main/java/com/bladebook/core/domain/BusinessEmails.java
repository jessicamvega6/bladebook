package com.bladebook.core.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The coach's business-email list (Profile → Business email; ADR-016, amended 2026-10-13, 2026-11-06 and 2026-11-12;
 * {@code FeatureDecriptions/C_Coach Profile.md}, "Business email"): the login email, which is always on it; the other
 * confirmed addresses; and the addresses waiting for their link, each with its token's hash and when the link expires.
 * {@code current} is the address families' replies go to, or {@code null} while a new coach's first address waits.
 *
 * <p>Immutable: each change returns a new list. Addresses keep the case they were typed in and compare without it.
 */
public final class BusinessEmails {

    /** How long a link works (owner, 2026-11-12). */
    public static final Duration LINK_LIFETIME = Duration.ofDays(3);
    /** Resend waits this long after the last link, so a double click or a script can't flood someone's inbox. */
    public static final Duration RESEND_WAIT = Duration.ofMinutes(1);
    /** Addresses on the list besides the login email. */
    public static final int MAX_ADDRESSES = 10;

    public static final String LINK_DOESNT_WORK =
            "This link doesn’t work any more. It may have been used already, replaced by a newer link, or be more than 3 days old.";

    /** One address's link: its token's hash and when it stops working. */
    public record Link(String tokenHash, Instant expiresAt) {

        public Link {
            Objects.requireNonNull(expiresAt, "expiresAt");
        }

        /** A link sent at {@code at}, working for {@link #LINK_LIFETIME}. */
        public static Link sentAt(String tokenHash, Instant at) {
            return new Link(Objects.requireNonNull(tokenHash, "tokenHash"), at.plus(LINK_LIFETIME));
        }

        /** An address left waiting by Batch 1's stand-in: no link was ever sent, so there's nothing to confirm with. */
        public static Link none() {
            return new Link(null, Instant.EPOCH);
        }

        public Instant sentAt() {
            return expiresAt.minus(LINK_LIFETIME);
        }

        public boolean expired(Instant now) {
            return !now.isBefore(expiresAt);
        }

        public boolean matches(String hash) {
            return LinkToken.same(tokenHash, hash);
        }
    }

    private final String login;
    private final String current;
    private final List<String> confirmed;
    private final Map<String, Link> pending;

    /**
     * @param confirmed the confirmed addresses other than the login email, in the order they were confirmed
     * @param pending   the addresses waiting for their link
     */
    public BusinessEmails(String login, String current, List<String> confirmed, Map<String, Link> pending) {
        this.login = Objects.requireNonNull(login, "login");
        this.current = current;
        this.confirmed = List.copyOf(confirmed);
        this.pending = new LinkedHashMap<>(pending);
    }

    public String login() { return login; }
    /** The address families' replies go to, or {@code null} while a new coach's first address waits for its link. */
    public String current() { return current; }
    public List<String> confirmed() { return confirmed; }
    public Map<String, Link> pending() { return Map.copyOf(pending); }

    /** The waiting address whose link went out last, if any: the one the "not working yet" banner names. */
    public Optional<String> newestPending() {
        return pending.entrySet().stream().max(Comparator.comparing(e -> e.getValue().expiresAt())).map(Map.Entry::getKey);
    }

    /** "Use a new address": the address waits for its link. Families keep the current address until then. */
    public BusinessEmails add(String address, Link link) {
        if (onList(address)) {
            throw DomainException.invalid("address", "That address is already on your list.");
        }
        if (confirmed.size() + pending.size() >= MAX_ADDRESSES) {
            throw DomainException.invalid("address", "You can keep up to " + MAX_ADDRESSES
                    + " addresses besides your login email. Remove one first.");
        }
        Map<String, Link> p = new LinkedHashMap<>(pending);
        p.put(address, link);
        return new BusinessEmails(login, current, confirmed, p);
    }

    /** "Resend link": a new link replaces the old one, which stops working. */
    public BusinessEmails resend(String address, Link link, Instant now) {
        String key = pendingKey(address).orElseThrow(() -> DomainException.conflict("That address isn’t waiting for a link."));
        if (now.isBefore(pending.get(key).sentAt().plus(RESEND_WAIT))) {
            throw DomainException.conflict("We sent a link a moment ago. Check that inbox (and its spam folder), or try again in a minute.");
        }
        Map<String, Link> p = new LinkedHashMap<>(pending);
        p.put(key, link);
        return new BusinessEmails(login, current, confirmed, p);
    }

    /** The waiting address a token's hash is for, if its link still works. Changes nothing. */
    public Optional<String> find(String tokenHash, Instant now) {
        return pending.entrySet().stream().filter(e -> e.getValue().matches(tokenHash) && !e.getValue().expired(now))
                .map(Map.Entry::getKey).findFirst();
    }

    /**
     * The link's address is confirmed and becomes the business email (ADR-MASTER section 4; {@code architecture.md}
     * section 6.13). Its link is used up. The address it replaces stays on the list as confirmed.
     */
    public BusinessEmails confirm(String tokenHash, Instant now) {
        String address = find(tokenHash, now).orElseThrow(() -> DomainException.conflict(LINK_DOESNT_WORK));
        Map<String, Link> p = new LinkedHashMap<>(pending);
        p.remove(address);
        List<String> c = new ArrayList<>(confirmed);
        c.add(address);
        return new BusinessEmails(login, address, c, p);
    }

    /** Picks a confirmed address, or the login email, as the business email. */
    public BusinessEmails choose(String address) {
        if (ProfileRules.sameAddress(address, login)) {
            return new BusinessEmails(login, login, confirmed, pending);
        }
        String key = confirmed.stream().filter(a -> ProfileRules.sameAddress(a, address)).findFirst()
                .orElseThrow(() -> DomainException.invalid("address", pendingKey(address).isPresent()
                        ? "Use the link we emailed to that address to confirm it first."
                        : "That address isn’t on your list."));
        return new BusinessEmails(login, key, confirmed, pending);
    }

    /** Any address except the current one and the login email. Removing a waiting address kills its link. */
    public BusinessEmails remove(String address) {
        if (ProfileRules.sameAddress(address, login)) {
            throw DomainException.invalid("address", "Your login email stays on the list.");
        }
        if (ProfileRules.sameAddress(address, current)) {
            throw DomainException.invalid("address", "Families reach you at this address now. Choose another one first.");
        }
        Optional<String> waiting = pendingKey(address);
        if (waiting.isPresent()) {
            Map<String, Link> p = new LinkedHashMap<>(pending);
            p.remove(waiting.get());
            return new BusinessEmails(login, current, confirmed, p);
        }
        List<String> c = new ArrayList<>(confirmed);
        if (!c.removeIf(a -> ProfileRules.sameAddress(a, address))) {
            throw DomainException.invalid("address", "That address isn’t on your list.");
        }
        return new BusinessEmails(login, current, c, pending);
    }

    private boolean onList(String address) {
        return ProfileRules.sameAddress(address, login) || confirmed.stream().anyMatch(a -> ProfileRules.sameAddress(a, address))
                || pendingKey(address).isPresent();
    }

    private Optional<String> pendingKey(String address) {
        return pending.keySet().stream().filter(a -> ProfileRules.sameAddress(a, address)).findFirst();
    }
}
