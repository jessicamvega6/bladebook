package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.ScheduledRuns;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code sched-unpaid-reminder}: Monday morning, long-unpaid lessons, to the coach. */
public final class UnpaidReminder implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Jobs.run(ScheduledRuns.Job.UNPAID_REMINDER, in, context);
    }
}
