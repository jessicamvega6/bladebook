package com.bladebook.api.coach.security;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

/**
 * <b>Test code only</b> (ruling I31; never in a Lambda package). Signs ID tokens shaped like Cognito's ({@code sub},
 * {@code email}, {@code cognito:groups}, {@code aud}, {@code token_use}, {@code auth_time}) with a key made fresh
 * at every start, so the real checks in {@link CoachTokenRules} run against them. Active with the {@code stub-tokens}
 * profile: the API tests, and the seed generator, which starts the API from the test classpath ({@code TestApiCoachApplication}).
 * Its {@code POST /api/coach/local/token} route ({@link StubTokenController}) hands the seed generator a token by email.
 */
@Configuration
@Profile("stub-tokens")
public class TestTokenStub {

    static final String ISSUER = "http://localhost/local-token-stub";

    private final RSAKey key;
    private final NimbusJwtEncoder encoder;
    private final Clock clock;
    private final Map<String, String> subs;
    private final String coachAppClientId;

    public TestTokenStub(Clock clock, @Value("${bladebook.auth.coach-app-client-id}") String coachAppClientId,
                          @Value("${bladebook.local.subs-file:}") String subsFile) {
        this.subs = subs(subsFile);
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

    /** The token route needs no token: it's how the seed generator gets one. */
    @Bean
    WebSecurityCustomizer stubTokenRouteOpen() {
        return web -> web.ignoring().requestMatchers(HttpMethod.POST, StubTokenController.PATH);
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

    /**
     * The token's {@code sub}: the one {@code bladebook.local.subs-file} gives for this email, else one made from the email.
     * Dev's seed generator gives the file, so the seed file's items belong to the real test accounts' Cognito {@code sub}s
     * (ADR-028 decision 4).
     */
    String subFor(String email) {
        String e = email.trim().toLowerCase(Locale.ROOT);
        String sub = subs.get(e);
        return sub != null ? sub : UUID.nameUUIDFromBytes(e.getBytes(StandardCharsets.UTF_8)).toString();
    }

    /** {@code email=sub} lines. Blank: none. */
    static Map<String, String> subs(String file) {
        Map<String, String> out = new HashMap<>();
        if (file == null || file.isBlank()) {
            return out;
        }
        Properties p = new Properties();
        try (Reader r = Files.newBufferedReader(Path.of(file), StandardCharsets.UTF_8)) {
            p.load(r);
        } catch (IOException e) {
            throw new IllegalStateException("Can't read bladebook.local.subs-file " + file, e);
        }
        p.forEach((k, v) -> out.put(k.toString().trim().toLowerCase(Locale.ROOT), v.toString().trim()));
        return Map.copyOf(out);
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
