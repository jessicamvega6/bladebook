package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.ScheduledRuns;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code sched-lesson-roller}: nightly, lesson times stored about 15 months ahead; and, on its second rule, {@code sched-year-close} (January 1 to 7). */
public final class LessonRoller implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Jobs.run(ScheduledRuns.Job.LESSON_ROLLER, in, context);
    }
}
