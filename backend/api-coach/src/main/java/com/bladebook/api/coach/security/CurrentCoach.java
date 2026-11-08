package com.bladebook.api.coach.security;

import com.bladebook.core.data.AccessContext;
import org.springframework.security.oauth2.jwt.Jwt;

/** Who is calling, read only from the verified token (ADR-MASTER section 16). */
public final class CurrentCoach {

    private CurrentCoach() {
    }

    public static AccessContext of(Jwt jwt) {
        return new AccessContext(jwt.getSubject());
    }

    /** The login email: the Cognito username, from the token. */
    public static String loginEmail(Jwt jwt) {
        return jwt.getClaimAsString("email");
    }
}
