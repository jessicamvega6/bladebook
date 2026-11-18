package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.EventConsumers;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code consumer-schedule-change}: {@code ScheduleChanged}. Adds, removes, cancels and re-prices lesson times (ADR-MASTER section 9). */
public final class ScheduleChange implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Consumers.run(EventConsumers.Event.ScheduleChanged, in, context);
    }
}
