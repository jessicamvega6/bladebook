package com.bladebook.api.client.exception;

/** A coach code that no coach holds (or that can't be one). */
public final class NoSuchCoach extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public NoSuchCoach() {
        super("That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.");
    }
}
