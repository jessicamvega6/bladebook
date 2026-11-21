package com.bladebook.core.service;

import software.amazon.awssdk.core.SdkRequest;
import software.amazon.awssdk.core.interceptor.Context;
import software.amazon.awssdk.core.interceptor.ExecutionAttributes;
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * Test only: runs a step just before the next conditional writes on this thread, so a test can make a lesson change
 * between the service reading it and writing it (the "changed since it was read" paths). Registered with the AWS SDK as
 * a global interceptor (src/test/resources/software/amazon/awssdk/global/handlers/execution.interceptors); with no steps
 * queued it does nothing.
 *
 * <p>Each {@code TransactWriteItems} or {@code UpdateItem} call takes the next step, in order. Writes made by a step
 * itself don't take one.
 */
public final class WriteRaces implements ExecutionInterceptor {

    private static final ThreadLocal<Deque<Runnable>> STEPS = ThreadLocal.withInitial(ArrayDeque::new);
    private static final ThreadLocal<Boolean> RUNNING = ThreadLocal.withInitial(() -> false);

    /** Does nothing, so that write goes through untouched. */
    public static final Runnable NOTHING = () -> { };

    /** Queues one step per coming write, replacing any left over. */
    public static void beforeNextWrites(Runnable... steps) {
        STEPS.get().clear();
        STEPS.get().addAll(List.of(steps));
    }

    public static void clear() {
        STEPS.get().clear();
    }

    @Override
    public void beforeExecution(Context.BeforeExecution context, ExecutionAttributes attributes) {
        SdkRequest r = context.request();
        if (RUNNING.get() || !(r instanceof TransactWriteItemsRequest || r instanceof UpdateItemRequest)) {
            return;
        }
        Runnable step = STEPS.get().poll();
        if (step == null) {
            return;
        }
        RUNNING.set(true);
        try {
            step.run();
        } finally {
            RUNNING.set(false);
        }
    }
}
