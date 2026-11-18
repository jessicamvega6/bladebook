package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.EventConsumers;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** {@code consumer-booking-confirmation}: {@code LessonBooked}. The confirmation email per seat. */
public final class BookingConfirmation implements RequestStreamHandler {

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        Consumers.run(EventConsumers.Event.LessonBooked, in, context);
    }
}
