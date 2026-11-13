package com.bladebook.core.service;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * A shared lesson's seats changed, so {@code consumer-invite} should copy its read-only fields again (ADR-MASTER section 8,
 * "Read-only copies"). On AWS the table's stream does this; locally the API calls {@link InviteSyncService} in-process
 * after the write (a listed shortcut). The services call it after every write that adds, joins, ends or leaves a place.
 */
@FunctionalInterface
public interface SeatEvents {

    SeatEvents NONE = (coachId, date, start) -> { };

    void seatsChanged(String coachId, LocalDate date, LocalTime start);
}
