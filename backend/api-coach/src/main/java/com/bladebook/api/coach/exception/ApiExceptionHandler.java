package com.bladebook.api.coach.exception;

import com.bladebook.api.coach.security.RecentSignInRequired;
import com.bladebook.core.domain.DomainException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One error shape for the website: {@code {"error": CODE, "message": ..., "field": ...}}. Messages
 * are the coach-facing ones from core/; anything unexpected is a plain 500 with no detail.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(DomainException.class)
    ResponseEntity<Map<String, String>> domain(DomainException e) {
        switch (e.reason()) {
            case NOT_FOUND:
                return body(HttpStatus.NOT_FOUND, "NO_PROFILE", e.getMessage(), null);
            case CONFLICT:
                return body(HttpStatus.CONFLICT, "CONFLICT", e.getMessage(), null);
            default:
                return body(HttpStatus.BAD_REQUEST, "INVALID", e.getMessage(), e.field());
        }
    }

    /** Saving a schedule needs a fresh sign-in; the website asks for the password and retries. */
    @ExceptionHandler(RecentSignInRequired.class)
    ResponseEntity<Map<String, String>> recentSignIn(RecentSignInRequired e) {
        return body(HttpStatus.UNAUTHORIZED, "SIGN_IN_TO_SAVE", e.getMessage(), null);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> unreadable(HttpMessageNotReadableException e) {
        return body(HttpStatus.BAD_REQUEST, "INVALID", "Something in the form couldn't be read. Reload and try again.", null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        if (e instanceof ErrorResponse) {
            // Spring's own: unknown route, wrong method, wrong content type. Keep its status.
            HttpStatus status = HttpStatus.valueOf(((ErrorResponse) e).getStatusCode().value());
            return body(status, status.is4xxClientError() ? "BAD_REQUEST" : "SERVER", status.getReasonPhrase(), null);
        }
        // The type only: messages can hold request values.
        LOG.error("Unhandled {}", e.getClass().getName());
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "SERVER", "Something went wrong on our side. Try again.", null);
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String error, String message, String field) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("error", error);
        m.put("message", message);
        if (field != null) {
            m.put("field", field);
        }
        return ResponseEntity.status(status).body(m);
    }
}
