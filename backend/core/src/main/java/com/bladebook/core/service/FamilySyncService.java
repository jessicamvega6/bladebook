package com.bladebook.core.service;

import com.bladebook.core.data.SyncRepository;

/**
 * What {@code consumer-family-sync} does with a {@code FamilyChanged} event (ADR-MASTER section 5): copy the
 * family's contact details onto every coach's record of its skaters. On AWS it runs from the stream;
 * locally it's called in-process after the write (a listed shortcut).
 *
 * <p>Not here yet: issuing a new skater's share code, and copying a skater's rename or new number, which
 * arrive with the batches that add those edits.
 */
public final class FamilySyncService {

    private final SyncRepository sync;

    public FamilySyncService(SyncRepository sync) {
        this.sync = sync;
    }

    /** @return how many coach records were updated */
    public int familyChanged(String clientId) {
        return sync.account(clientId).map(sync::copyContact).orElse(0);
    }
}
