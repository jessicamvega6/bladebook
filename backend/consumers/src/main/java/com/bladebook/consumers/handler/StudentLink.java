package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.EventConsumers;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code consumer-student-link}: {@code StudentChanged}. Keeps the family's link in step with the coach's record; the decline email. */
public final class StudentLink implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Consumers.run(EventConsumers.Event.StudentChanged, in, context);
    }
}
