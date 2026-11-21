package com.bladebook.core.data;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/** For tests: catches the access log's lines instead of writing them; {@link #close} puts the application log back. */
public final class AccessLogCapture implements AutoCloseable {

    public final List<AccessLog.Line> lines = new ArrayList<>();

    public static AccessLogCapture start() {
        AccessLogCapture c = new AccessLogCapture();
        AccessLog.install(c.lines::addAll, Clock.systemUTC());
        return c;
    }

    /** The one line written for {@code operation}. */
    public AccessLog.Line only(String operation) {
        List<AccessLog.Line> l = lines.stream().filter(x -> x.operation().equals(operation)).toList();
        if (l.size() != 1) {
            throw new AssertionError("expected one " + operation + " line, found " + lines);
        }
        return l.get(0);
    }

    @Override
    public void close() {
        AccessLog.install(AccessLog.APPLICATION_LOG, Clock.systemUTC());
    }
}
