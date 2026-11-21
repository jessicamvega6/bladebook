package com.bladebook.core.data;

import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain;
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient;
import software.amazon.awssdk.services.cloudwatchlogs.model.CreateLogStreamRequest;
import software.amazon.awssdk.services.cloudwatchlogs.model.InputLogEvent;
import software.amazon.awssdk.services.cloudwatchlogs.model.PutLogEventsRequest;
import software.amazon.awssdk.services.cloudwatchlogs.model.PutLogEventsResponse;
import software.amazon.awssdk.services.cloudwatchlogs.model.ResourceAlreadyExistsException;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * On AWS: the access log's lines go straight to its own log group with {@code PutLogEvents} (I12, 2026-11-17), never to
 * the function's log. Each container writes its own stream, created on its first write; the function's role may create
 * streams in and write to that group only. A write CloudWatch doesn't take whole throws, which fails the request.
 */
public final class CloudWatchAccessLog implements AccessLog.Sink {

    private final CloudWatchLogsClient logs;
    private final String group;
    private final String stream;
    private volatile boolean created;

    CloudWatchAccessLog(CloudWatchLogsClient logs, String group, String stream) {
        this.logs = Objects.requireNonNull(logs, "logs");
        if (group == null || group.isBlank()) {
            throw new IllegalArgumentException("The access-log group isn't set.");
        }
        this.group = group;
        this.stream = stream;
    }

    /** {@code function}: the function's name, in the stream's name with the date and a random part. */
    public static CloudWatchAccessLog aws(String group, String function) {
        return new CloudWatchAccessLog(CloudWatchLogsClient.builder()
                .region(new DefaultAwsRegionProviderChain().getRegion())
                .httpClient(UrlConnectionHttpClient.create())
                .build(), group, LocalDate.now(ZoneOffset.UTC) + "/" + function + "/" + UUID.randomUUID());
    }

    @Override
    public void write(List<AccessLog.Line> lines) {
        if (lines.isEmpty()) {
            return;
        }
        if (!created) {
            try {
                logs.createLogStream(CreateLogStreamRequest.builder().logGroupName(group).logStreamName(stream).build());
            } catch (ResourceAlreadyExistsException e) {
                // made by an earlier attempt
            }
            created = true;
        }
        // CloudWatch wants a batch in time order.
        List<InputLogEvent> events = lines.stream()
                .sorted((a, b) -> a.at().compareTo(b.at()))
                .map(l -> InputLogEvent.builder().timestamp(l.at().toEpochMilli()).message(l.json()).build())
                .toList();
        PutLogEventsResponse r = logs.putLogEvents(PutLogEventsRequest.builder()
                .logGroupName(group).logStreamName(stream).logEvents(events).build());
        if (r.rejectedLogEventsInfo() != null) {
            throw new IllegalStateException("CloudWatch refused access-log lines: " + r.rejectedLogEventsInfo());
        }
    }
}
