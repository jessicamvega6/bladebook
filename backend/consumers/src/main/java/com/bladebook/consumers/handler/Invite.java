package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.EventConsumers;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code consumer-invite}: {@code SharedLessonChanged}. Read-only copies on a shared lesson's seats; the shared-lesson emails (section 8). */
public final class Invite implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Consumers.run(EventConsumers.Event.SharedLessonChanged, in, context);
    }
}
