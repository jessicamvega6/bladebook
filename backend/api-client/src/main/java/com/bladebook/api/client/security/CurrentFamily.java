package com.bladebook.api.client.security;

import com.bladebook.core.data.ClientContext;
import org.springframework.security.oauth2.jwt.Jwt;

/** Who is calling, read only from the verified token (ADR-MASTER section 16). */
public final class CurrentFamily {

    private CurrentFamily() {
    }

    public static ClientContext of(Jwt jwt) {
        return new ClientContext(jwt.getSubject());
    }

    /** The login email: the Cognito username, from the token. */
    public static String loginEmail(Jwt jwt) {
        return jwt.getClaimAsString("email");
    }
}
