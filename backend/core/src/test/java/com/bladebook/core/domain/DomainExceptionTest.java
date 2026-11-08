package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DomainExceptionTest {

    @Test
    void invalidCarriesTheField() {
        DomainException e = DomainException.invalid("phone", "Enter a phone number with 10 digits.");
        assertThat(e.reason()).isEqualTo(DomainException.Reason.INVALID);
        assertThat(e.field()).isEqualTo("phone");
        assertThat(e.getMessage()).isEqualTo("Enter a phone number with 10 digits.");
    }

    @Test
    void notFoundAndConflictHaveNoField() {
        assertThat(DomainException.notFound("No profile.").reason()).isEqualTo(DomainException.Reason.NOT_FOUND);
        assertThat(DomainException.notFound("No profile.").field()).isNull();
        assertThat(DomainException.conflict("Already set up.").reason()).isEqualTo(DomainException.Reason.CONFLICT);
    }
}
