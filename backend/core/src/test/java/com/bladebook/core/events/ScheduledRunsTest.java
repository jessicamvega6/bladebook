package com.bladebook.core.events;

import com.bladebook.core.data.AccessLog;
import com.bladebook.core.data.AccessLogCapture;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.service.LocalOutbox;
import com.bladebook.core.service.NotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The scheduled jobs on AWS (ADR-MASTER sections 2 and 14). Each job's own flows are tested with its service; here, the
 * Scheduler's input, the date each run is for, its access-log line (I21) and its completion metric (section 19).
 */
class ScheduledRunsTest {

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    private final LocalOutbox outbox = new LocalOutbox(Clock.systemUTC());
    private final ScheduledRuns runs = new ScheduledRuns("bladebook-dev-sched-day-reminder", f.clients, f.table, outbox,
            new NotificationService.Links("https://app.bladebook.test", "https://family.bladebook.test"), () -> 7, Clock.systemUTC());
    private final AccessLogCapture log = AccessLogCapture.start();

    @AfterEach
    void tearDown() {
        log.close();
    }

    private static String input(String job, String at) {
        return "{\"job\":\"" + job + "\",\"scheduledTime\":\"" + at + "\"}";
    }

    @Test
    void eachRunIsForTheDateItsTimeFallsOnInTheLaunchTimeZone() {
        // 7:00 AM Central on November 18 is 13:00 UTC; 2:30 AM Central on November 19 is 08:30 UTC.
        assertThat(runs.run(input("sched-day-reminder", "2026-11-18T13:00:00Z")).date()).isEqualTo(LocalDate.of(2026, 11, 18));
        assertThat(runs.run(input("sched-lesson-roller", "2026-11-19T08:30:00Z")).date()).isEqualTo(LocalDate.of(2026, 11, 19));
        // 11:00 PM Central on November 18 is already November 19 in UTC; it's still the 18th's run.
        assertThat(runs.run(input("sched-deadline-sweep", "2026-11-19T05:00:00Z")).date()).isEqualTo(LocalDate.of(2026, 11, 18));
    }

    @Test
    void aJobThatReadsPersonalDataWritesOneLineOfCountsAndFieldNamesAndNoIds() {
        ScheduledRuns.Outcome o = runs.run(input("sched-day-reminder", "2026-11-18T13:00:00Z"));
        assertThat(o.counts()).containsOnlyKeys("familyReminders", "morningEmails");

        AccessLog.Line line = log.only("sched-day-reminder:2026-11-18");
        assertThat(line.role()).isEqualTo("job");
        assertThat(line.actor()).isEqualTo("bladebook-dev-sched-day-reminder");
        assertThat(line.ids()).isEmpty();
        assertThat(line.counts()).isEqualTo(Map.of("familyReminders", 0, "morningEmails", 0));
        assertThat(line.fields()).contains("clientEmail", "studentName");
        assertThat(line.json()).contains("\"counts\":{\"familyReminders\":0,\"morningEmails\":0}");
    }

    @Test
    void theRollerAndTheYearCloseReadNoPersonalDataAndWriteNoLine() {
        runs.run(input("sched-lesson-roller", "2026-11-19T08:30:00Z"));
        runs.run(input("sched-year-close", "2027-01-01T14:00:00Z"));
        assertThat(log.lines).isEmpty();
    }

    @Test
    void theRollerTheYearCloseAndTheSweepReportTheirCompletionMetricAndTheRemindersDont() {
        for (String job : new String[]{"sched-lesson-roller", "sched-year-close", "sched-deadline-sweep"}) {
            String metric = runs.run(input(job, "2027-01-02T14:00:00Z")).metric();
            var m = JsonMapper.builder().build().readTree(metric);
            assertThat(m.get("_aws").get("CloudWatchMetrics").get(0).get("Namespace").asString()).isEqualTo("BladeBook");
            assertThat(m.get("Function").asString()).isEqualTo("bladebook-dev-sched-day-reminder");
            String name = m.get("_aws").get("CloudWatchMetrics").get(0).get("Metrics").get(0).get("Name").asString();
            assertThat(m.get(name).asInt()).isEqualTo(1);
        }
        assertThat(runs.run(input("sched-unpaid-reminder", "2026-11-16T14:00:00Z")).metric()).isNull();
        assertThat(ScheduledRuns.Job.DEADLINE_SWEEP.metric).isEqualTo("DeadlineSweepCompleted");
    }

    @Test
    void aBadInputIsRefused() {
        assertThatThrownBy(() -> runs.run("{\"job\":\"sched-day-reminder\"}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> runs.run(input("sched-daily-report", "2026-11-18T13:00:00Z")))
                .hasMessageContaining("unknown job");
        assertThatThrownBy(() -> ScheduledRuns.fromEnvironment(Map.<String, String>of()::get))
                .hasMessageContaining("AWS_LAMBDA_FUNCTION_NAME");
        assertThat(ScheduledRuns.metricLine("X", "f", Instant.EPOCH)).contains("\"Timestamp\":0");
        assertThat(ScheduledRuns.FIELDS).containsOnlyKeys(ScheduledRuns.Job.values());
        assertThat(ScheduledRuns.threshold(" 7 ")).isEqualTo(7);
        assertThat(ScheduledRuns.threshold(" ")).isNull();
        assertThat(ScheduledRuns.threshold(null)).isNull();
        assertThat(outbox.list()).isEmpty();
    }

    @Test
    void theDriftCheckReadsOnlyAndReportsItsFindingsAsMetrics() {
        java.util.List<String> handedOn = new java.util.ArrayList<>();
        ScheduledRuns drift = new ScheduledRuns("bladebook-dev-sched-drift-check", f.clients, f.table, outbox,
                new NotificationService.Links("https://app.bladebook.test", "https://family.bladebook.test"), () -> null,
                Clock.systemUTC(), handedOn::add);
        ScheduledRuns.Outcome o = drift.run(input("sched-drift-check", "2026-11-19T08:00:00Z"));

        assertThat(o.counts()).containsEntry("coaches", 0).containsEntry("reconcileFailed", 0).containsEntry("missedCancellations", 0);
        assertThat(handedOn).isEmpty(); // nothing stuck
        var m = JsonMapper.builder().build().readTree(o.metric());
        assertThat(m.get("_aws").get("CloudWatchMetrics").get(0).get("Metrics")).hasSize(4);
        assertThat(m.get("DriftCheckCompleted").asInt()).isEqualTo(1);
        assertThat(m.get("DriftMissedCancellations").asInt()).isZero();
        assertThat(log.lines).isEmpty(); // counts only: no personal data in its output (I23)
    }
}
