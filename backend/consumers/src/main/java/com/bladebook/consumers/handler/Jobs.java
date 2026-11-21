package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.bladebook.core.events.ScheduledRuns;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** What every scheduled job's handler does: reads the Scheduler's input and hands it to core. Set up once per container. */
final class Jobs {

    private static volatile ScheduledRuns runs;

    private Jobs() {
    }

    static void run(ScheduledRuns.Job expected, InputStream in, Context context) throws IOException {
        ScheduledRuns.Outcome o = get().run(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        if (o.job() != expected && !(expected == ScheduledRuns.Job.LESSON_ROLLER && o.job() == ScheduledRuns.Job.YEAR_CLOSE)) {
            throw new IllegalStateException(o.job().rule + " was sent to " + expected.rule + "'s function");
        }
        // Counts only (ADR-MASTER section 18); then the completion metric, as its own line (CloudWatch reads it).
        context.getLogger().log(o.job().rule + " for " + o.date() + ": " + o.counts());
        if (o.metric() != null) {
            context.getLogger().log(o.metric());
        }
    }

    private static ScheduledRuns get() {
        ScheduledRuns r = runs;
        if (r == null) {
            synchronized (Jobs.class) {
                if (runs == null) {
                    runs = ScheduledRuns.fromEnvironment();
                }
                r = runs;
            }
        }
        return r;
    }
}
