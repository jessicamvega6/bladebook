package com.bladebook.core.service;

import com.bladebook.core.data.SyncRepository;

/**
 * What {@code consumer-family-sync} does with a {@code FamilyChanged} event (ADR-MASTER section 5): copy the
 * family's contact details onto every coach's record of its skaters, and issue each new skater's share code
 * (ADR-MASTER section 3, "Share code"; Batch 11). On AWS it runs from the stream; locally it's called in-process after
 * the write (a listed shortcut).
 *
 * <p>Not here yet: copying a skater's rename or new number, which arrive with the batch that adds those edits.
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

    /**
     * Gives every skater of the family without a share code one: a {@code SKATERCODE#} item written only if the code is
     * free, then copied onto the {@code SKATER#} item only if it has none. A code is never changed.
     *
     * @return how many codes were issued
     */
    public int issueShareCodes(String clientId) {
        return sync.account(clientId).map(sync::issueShareCodes).orElse(0);
    }
}
