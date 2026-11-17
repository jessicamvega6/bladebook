package com.bladebook.core.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * The token in a business-email confirmation link (ADR-016, amended 2026-11-12). The link carries 32 random bytes; the
 * profile keeps only their Secure Hash Algorithm (SHA-256) hash, so reading the table can't produce a working link.
 */
public final class LinkToken {

    /** Longer than any token this class makes; anything longer isn't hashed at all. */
    public static final int MAX_LENGTH = 128;

    private LinkToken() {
    }

    /** 32 random bytes, base64url without padding: 43 characters, safe in a URL. */
    public static String random(SecureRandom random) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** SHA-256 of the token, in lower-case hex. */
    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is missing", e);
        }
    }

    /** The hash of a token from a request, or {@code null} if there's no usable token. */
    public static String hashOrNull(String token) {
        String t = token == null ? "" : token.trim();
        return t.isEmpty() || t.length() > MAX_LENGTH ? null : hash(t);
    }

    /** Compares two hashes in constant time; a missing one never matches. */
    public static boolean same(String a, String b) {
        return a != null && b != null
                && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
