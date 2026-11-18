package com.bladebook.consumers.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.TtlArchive;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** {@code consumer-ttl-archiver}: each TTL removal on the table's stream, to the archive bucket (ADR-MASTER section 20). */
public final class TtlArchiver implements RequestStreamHandler {

    private static volatile TtlArchive archive;

    @Override
    public void handleRequest(InputStream in, OutputStream out, Context context) throws IOException {
        TtlArchive a = archive;
        if (a == null) {
            synchronized (TtlArchiver.class) {
                if (archive == null) {
                    archive = TtlArchive.fromEnvironment();
                }
                a = archive;
            }
        }
        TtlArchive.Archived r = a.run(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        context.getLogger().log("consumer-ttl-archiver: " + r.archived() + " archived, " + r.ignored() + " not TTL removals");
    }
}
