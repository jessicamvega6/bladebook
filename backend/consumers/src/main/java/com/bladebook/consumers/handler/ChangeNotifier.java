package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.EventConsumers;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code consumer-change-notifier}: {@code LessonsChanged}. One email per family (or to the coach) per change batch. */
public final class ChangeNotifier implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Consumers.run(EventConsumers.Event.LessonsChanged, in, context);
    }
}
