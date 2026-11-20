package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.ScheduledRuns;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code sched-drift-check}: nightly, reading only; hands a stuck batch to {@code consumer-schedule-change} (section 19). */
public final class DriftCheck implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Jobs.run(ScheduledRuns.Job.DRIFT_CHECK, in, context);
    }
}
