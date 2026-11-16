package com.bladebook.core.service;

import com.bladebook.core.data.AccessContext;
import com.bladebook.core.data.NotifyRepository;

import java.time.LocalDate;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * {@code sched-year-close} (Batch 26; ADR-MASTER sections 12 and 14, amended 2026-11-16): on each of the first days of
 * January, saves last year's figures for every coach whose year has closed (midnight starting January 1 in the coach's
 * time zone) and who hasn't had them saved yet. It takes the date it is for, as the Scheduler's trigger carries it, and
 * saves the year before that date's; it reads the clock only to make sure each coach's year has really closed. Safe to
 * run twice: a saved year is never written again. One coach's failure doesn't stop the rest.
 */
public final class ClosedYearJob {

    /** What a run did. {@code coaches}: coaches handled without an error. */
    public record Result(int coaches, int saved, int alreadySaved, int notClosedYet) {
    }

    private static final Logger LOG = Logger.getLogger(ClosedYearJob.class.getName());

    private final NotifyRepository repo;
    private final FinancialService finances;

    public ClosedYearJob(NotifyRepository repo, FinancialService finances) {
        this.repo = repo;
        this.finances = finances;
    }

    public Result run(LocalDate date) {
        int year = date.getYear() - 1;
        int coaches = 0;
        int saved = 0;
        int already = 0;
        int notYet = 0;
        for (String coachId : repo.coachIds()) {
            try {
                FinancialService.Saved r = finances.saveClosedYear(new AccessContext(coachId), year);
                coaches++;
                if (r == FinancialService.Saved.SAVED) {
                    saved++;
                } else if (r == FinancialService.Saved.ALREADY_SAVED) {
                    already++;
                } else {
                    notYet++;
                }
            } catch (RuntimeException e) {
                LOG.log(Level.WARNING, "sched-year-close: one coach failed; the rest go on", e);
            }
        }
        return new Result(coaches, saved, already, notYet);
    }
}
