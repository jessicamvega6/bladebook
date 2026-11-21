package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.ScheduledRuns;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code sched-deadline-sweep}: hourly, shared-lesson deadlines (GSI4). */
public final class DeadlineSweep implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Jobs.run(ScheduledRuns.Job.DEADLINE_SWEEP, in, context);
    }
}
