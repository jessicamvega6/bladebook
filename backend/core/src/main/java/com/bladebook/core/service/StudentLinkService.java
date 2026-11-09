package com.bladebook.core.service;

import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.domain.StudentRecord;
import com.bladebook.core.domain.StudentStatus;

/**
 * What {@code consumer-student-link} does with a {@code StudentChanged} event (ADR-MASTER sections 3 and 5):
 * the family's link item follows the coach's {@code STUDENT#} record. On AWS it runs from the stream;
 * locally it's called in-process after the write (a listed shortcut).
 *
 * <p>Not here yet: the decline email to the family (a listed shortcut), and the approval email, which
 * is Phase 2 (A10).
 */
public final class StudentLinkService {

    private final SyncRepository sync;

    public StudentLinkService(SyncRepository sync) {
        this.sync = sync;
    }

    public void approved(StudentRecord after) {
        sync.setLinkStatus(after.clientId(), after.coachId(), after.studentId(), StudentStatus.ACTIVE);
    }

    /** The record was removed: the link goes too. The family's account and skater stay. */
    public void declined(StudentRecord before) {
        sync.deleteLink(before.clientId(), before.coachId(), before.studentId());
    }
}
