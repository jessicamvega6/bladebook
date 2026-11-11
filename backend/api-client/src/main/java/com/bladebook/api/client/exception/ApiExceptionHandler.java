package com.bladebook.api.client.exception;

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
 * One error shape for the family website: {@code {"error": CODE, "message": ..., "field": ...}}. Messages are
 * the family-facing ones from core/; anything unexpected is a plain 500 with no detail.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(DomainException.class)
    ResponseEntity<Map<String, String>> domain(DomainException e) {
        switch (e.reason()) {
            case NOT_FOUND:
                return body(HttpStatus.NOT_FOUND, "NO_ACCOUNT", e.getMessage(), null);
            case CONFLICT:
                return body(HttpStatus.CONFLICT, "CONFLICT", e.getMessage(), null);
            case NO_SUCH_ITEM:
                return body(HttpStatus.NOT_FOUND, "NOT_FOUND", e.getMessage(), null);
            default:
                return body(HttpStatus.BAD_REQUEST, "INVALID", e.getMessage(), e.field());
        }
    }

    @ExceptionHandler(NoSuchCoach.class)
    ResponseEntity<Map<String, String>> noSuchCoach(NoSuchCoach e) {
        return body(HttpStatus.NOT_FOUND, "NO_COACH", e.getMessage(), "coachCode");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> unreadable(HttpMessageNotReadableException e) {
        return body(HttpStatus.BAD_REQUEST, "INVALID", "Something in the form couldn't be read. Reload and try again.", null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        if (e instanceof ErrorResponse) {
            HttpStatus status = HttpStatus.valueOf(((ErrorResponse) e).getStatusCode().value());
            return body(status, status.is4xxClientError() ? "BAD_REQUEST" : "SERVER", status.getReasonPhrase(), null);
        }
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
