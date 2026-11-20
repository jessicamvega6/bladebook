package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.bladebook.core.events.EventConsumers;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** What every consumer's handler does: reads the event and hands it to core. Set up once per container. */
final class Consumers {

    private static volatile EventConsumers consumers;

    private Consumers() {
    }

    static void run(EventConsumers.Event event, InputStream in, Context context) throws IOException {
        EventConsumers.Outcome o = get().run(event, new String(in.readAllBytes(), StandardCharsets.UTF_8), context.getAwsRequestId());
        // Counts only: never a name or an address (ADR-MASTER section 18).
        context.getLogger().log(o.count() < 0 ? event + ": not this event's record" : event + ": " + o.count() + " " + o.what());
    }

    private static EventConsumers get() {
        EventConsumers c = consumers;
        if (c == null) {
            synchronized (Consumers.class) {
                if (consumers == null) {
                    consumers = EventConsumers.fromEnvironment();
                }
                c = consumers;
            }
        }
        return c;
    }
}
