package com.bladebook.core.service;

import com.bladebook.core.data.ShareRepository;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * What {@code consumer-invite} writes (ADR-MASTER section 8, "Read-only copies"): the invited family's ID and GSI1 keys on
 * an invited seat, so the invitation shows on their pages, and each seat's copy of who it shares with. Never either
 * family's write. Its emails (the invitation and every outcome) are the notification batch's (Batch 13).
 */
public final class InviteSyncService implements SeatEvents {

    private final ShareRepository shares;

    public InviteSyncService(ShareRepository shares) {
        this.shares = shares;
    }

    @Override
    public void seatsChanged(String coachId, LocalDate date, LocalTime start) {
        shares.syncLesson(coachId, date, start);
    }
}
