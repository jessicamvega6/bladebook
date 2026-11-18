package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient;
import software.amazon.awssdk.services.cloudwatchlogs.model.CreateLogStreamRequest;
import software.amazon.awssdk.services.cloudwatchlogs.model.CreateLogStreamResponse;
import software.amazon.awssdk.services.cloudwatchlogs.model.PutLogEventsRequest;
import software.amazon.awssdk.services.cloudwatchlogs.model.PutLogEventsResponse;
import software.amazon.awssdk.services.cloudwatchlogs.model.RejectedLogEventsInfo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CloudWatchAccessLogTest {

    private final List<Object> calls = new ArrayList<>();
    private PutLogEventsResponse answer = PutLogEventsResponse.builder().build();

    private final CloudWatchLogsClient logs = new CloudWatchLogsClient() {
        @Override
        public CreateLogStreamResponse createLogStream(CreateLogStreamRequest r) {
            calls.add(r);
            return CreateLogStreamResponse.builder().build();
        }

        @Override
        public PutLogEventsResponse putLogEvents(PutLogEventsRequest r) {
            calls.add(r);
            return answer;
        }

        @Override
        public String serviceName() {
            return "logs";
        }

        @Override
        public void close() {
        }
    };

    private static AccessLog.Line line(String at) {
        return new AccessLog.Line(Instant.parse(at), "req", "203.0.113.7", "coach", "c1", null, "students",
                Map.of("studentId", Set.of("s1")), null, Set.of("studentName"));
    }

    @Test
    void theStreamIsMadeOnceAndEachWriteIsOnePutInTimeOrder() {
        CloudWatchAccessLog sink = new CloudWatchAccessLog(logs, "/bladebook-dev/access-log", "2026-11-17/api-coach/x");
        sink.write(List.of(line("2026-11-17T12:00:02Z"), line("2026-11-17T12:00:01Z")));
        sink.write(List.of(line("2026-11-17T12:00:03Z")));
        assertThat(calls).hasSize(3);
        assertThat(calls.get(0)).isInstanceOf(CreateLogStreamRequest.class);
        PutLogEventsRequest put = (PutLogEventsRequest) calls.get(1);
        assertThat(put.logGroupName()).isEqualTo("/bladebook-dev/access-log");
        assertThat(put.logStreamName()).isEqualTo("2026-11-17/api-coach/x");
        assertThat(put.logEvents()).extracting(e -> e.timestamp())
                .containsExactly(Instant.parse("2026-11-17T12:00:01Z").toEpochMilli(), Instant.parse("2026-11-17T12:00:02Z").toEpochMilli());
    }

    @Test
    void linesCloudWatchRefusesFailTheWrite() {
        answer = PutLogEventsResponse.builder().rejectedLogEventsInfo(RejectedLogEventsInfo.builder().tooOldLogEventEndIndex(1).build()).build();
        CloudWatchAccessLog sink = new CloudWatchAccessLog(logs, "/g", "s");
        assertThatThrownBy(() -> sink.write(List.of(line("2026-11-17T12:00:00Z")))).hasMessageContaining("refused");
    }

    @Test
    void theGroupMustBeSet() {
        assertThatThrownBy(() -> new CloudWatchAccessLog(logs, "", "s")).isInstanceOf(IllegalArgumentException.class);
    }
}
