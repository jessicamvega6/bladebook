package com.bladebook.core.service;

import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.domain.CoachCode;
import com.bladebook.core.domain.CoachName;
import com.bladebook.core.domain.DomainException;

import java.util.Optional;

/**
 * The coach-code lookup before sign-in (ADR-MASTER section 5, step 1). Returns the coach's name only. A
 * code that can't be a coach code gets the same answer as an unknown one, so the two can't be told apart.
 */
public final class CodeLookupService {

    private final CodeRepository codes;

    public CodeLookupService(CodeRepository codes) {
        this.codes = codes;
    }

    public Optional<CoachName> lookup(String typed) {
        CoachCode code;
        try {
            code = CoachCode.parse(typed);
        } catch (DomainException notACode) {
            return Optional.empty();
        }
        return codes.lookup(code);
    }
}
