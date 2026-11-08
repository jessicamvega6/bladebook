package com.bladebook.api.coach.security;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * <b>Local stand-in for Cognito</b> (implementation plan, Question 3; listed as a shortcut). Exists
 * only in the {@code local} profile. It signs ID tokens shaped like Cognito's — {@code sub},
 * {@code email}, {@code cognito:groups}, {@code aud}, {@code token_use}, {@code auth_time} — with a
 * key made fresh at every start, and the real checks in {@link CoachTokenRules} run against them.
 */
@Configuration
@Profile("local")
public class LocalTokenStub {

    static final String ISSUER = "http://localhost/local-token-stub";

    private final RSAKey key;
    private final NimbusJwtEncoder encoder;
    private final Clock clock;
    private final String coachAppClientId;

    public LocalTokenStub(Clock clock, @Value("${bladebook.auth.coach-app-client-id}") String coachAppClientId) {
        KeyPair pair = rsa();
        this.key = new RSAKey.Builder((RSAPublicKey) pair.getPublic()).privateKey((RSAPrivateKey) pair.getPrivate())
                .keyID(UUID.randomUUID().toString()).build();
        this.encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
        this.clock = clock;
        this.coachAppClientId = coachAppClientId;
    }

    @Bean
    JwtDecoder localJwtDecoder() throws Exception {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(ISSUER));
        return decoder;
    }

    /** A coach's ID token. The same email always gets the same {@code sub}, as one Cognito user would. */
    public String coachToken(String email) {
        return token(email, List.of("Coach"), coachAppClientId, clock.instant());
    }

    /** Any shape of token, for tests of the checks. */
    public String token(String email, List<String> groups, String audience, Instant authTime) {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(subFor(email))
                .audience(List.of(audience))
                .issuedAt(now)
                .expiresAt(now.plus(Duration.ofMinutes(60)))
                .claim("token_use", "id")
                .claim("email", email)
                .claim("email_verified", true)
                .claim("cognito:groups", groups)
                .claim("auth_time", authTime.getEpochSecond())
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).keyId(key.getKeyID()).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    static String subFor(String email) {
        return UUID.nameUUIDFromBytes(email.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)).toString();
    }

    private static KeyPair rsa() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            return g.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
