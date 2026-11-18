package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.ScheduledRuns;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code sched-day-reminder}: about 7:00 AM, the families' day-of reminders and the coaches' morning emails. */
public final class DayReminder implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Jobs.run(ScheduledRuns.Job.DAY_REMINDER, in, context);
    }
}
