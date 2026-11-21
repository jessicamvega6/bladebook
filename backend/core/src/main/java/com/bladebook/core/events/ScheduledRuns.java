package com.bladebook.core.events;

import com.bladebook.core.data.AccessLog;
import com.bladebook.core.data.CloudWatchAccessLog;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.FinancialRepository;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.ShareRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.ClosedYearJob;
import com.bladebook.core.service.DeadlineSweepService;
import com.bladebook.core.service.FinancialService;
import com.bladebook.core.service.Mailer;
import com.bladebook.core.service.NotificationService;
import com.bladebook.core.service.PaymentService;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.ScheduledJobs;
import com.bladebook.core.service.SeatEvents;
import com.bladebook.core.service.SesMailer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.Supplier;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.InvocationType;
import software.amazon.awssdk.services.lambda.model.InvokeResponse;
import software.amazon.awssdk.services.ssm.SsmClient;
import software.amazon.awssdk.services.ssm.model.ParameterNotFoundException;

/**
 * The scheduled jobs on AWS (ADR-MASTER sections 2 and 14): EventBridge Scheduler invokes each {@code sched-*} function
 * directly, with the time it was scheduled for. Each job takes the date that time falls on in the launch time zone (or, for
 * the sweep, the time itself), never the clock, so a re-run or a late run works on its own date.
 *
 * <p>Each run that reads personal data writes one access-log line (ADR-MASTER section 18; I21). The roller, the year close
 * and the sweep also report a completion metric, which drives their missed-run alarms (section 19).
 */
public final class ScheduledRuns {

    /** The launch time zone the Scheduler's rules use (owner, 2026-11-17, I7). */
    public static final ZoneId LAUNCH = ZoneId.of("America/Chicago");

    /** Each Scheduler rule, by its name (ADR-MASTER section 3). The roller's function also runs the year close. */
    public enum Job {
        DAY_REMINDER("sched-day-reminder", null),
        UNPAID_REMINDER("sched-unpaid-reminder", null),
        LESSON_ROLLER("sched-lesson-roller", "LessonRollerCompleted"),
        YEAR_CLOSE("sched-year-close", "YearCloseCompleted"),
        DEADLINE_SWEEP("sched-deadline-sweep", "DeadlineSweepCompleted"),
        DRIFT_CHECK("sched-drift-check", "DriftCheckCompleted");

        public final String rule;
        /** The completion metric, or null if the job has none (its Invocations drive its alarm). */
        public final String metric;

        Job(String rule, String metric) {
            this.rule = rule;
            this.metric = metric;
        }

        public static Job ofRule(String rule) {
            for (Job j : values()) {
                if (j.rule.equals(rule)) {
                    return j;
                }
            }
            throw new IllegalArgumentException("unknown job " + rule);
        }
    }

    /**
     * What one run did: counts only, for the function's log. {@code metric}: the line that reports the completion metric in
     * CloudWatch's embedded metric format, or null.
     */
    public record Outcome(Job job, LocalDate date, Map<String, Integer> counts, String metric) {
    }

    /**
     * The personal-data fields each job's output uses (the emails it sends, the lines it writes), named once on its
     * access-log line (owner, 2026-11-18, I23). The roller and the year close output none: they read profiles and skater
     * records only to list coaches and work out figures, so they write no line.
     */
    static final Map<Job, List<String>> FIELDS = Map.of(
            Job.DAY_REMINDER, List.of("businessEmail", "clientEmail", "firstName", "lastName", "loginEmail",
                    "studentName"),
            Job.UNPAID_REMINDER, List.of("loginEmail", "studentName"),
            Job.LESSON_ROLLER, List.of(),
            Job.YEAR_CLOSE, List.of(),
            Job.DEADLINE_SWEEP, List.of("invitedByName", "leftStudentName", "partnerName", "studentName"),
            // It reads seats to find coaches, and outputs counts only.
            Job.DRIFT_CHECK, List.of());

    /** How far ahead the drift check looks for coaches with lessons (ADR-MASTER section 19). */
    static final int DRIFT_DAYS = 30;

    /**
     * Finishes a coach's stuck batch: on AWS, invokes {@code consumer-schedule-change} and waits (ADR-MASTER section 19).
     * Throws if that failed.
     */
    @FunctionalInterface
    public interface Reconciler {
        void reconcile(String coachId);
    }

    /** The metrics' namespace. The {@code Function} dimension (its name carries the environment) tells them apart. */
    static final String NAMESPACE = "BladeBook";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final String function;
    private final ScheduledJobs jobs;
    private final NotifyRepository notify;
    private final NotificationService notifications;
    private final ScheduleChangeService change;
    private final Mailer mailer;
    /** Read on every unpaid run, so a change to the setting takes effect without a deploy. */
    private final Supplier<Integer> unpaidThresholdDays;
    private final ClosedYearJob yearClose;
    private final DeadlineSweepService sweep;
    private final Reconciler reconciler;

    public ScheduledRuns(String function, TenantClients clients, String table, Mailer mailer, NotificationService.Links links,
                         Supplier<Integer> unpaidThresholdDays, Clock clock) {
        this(function, clients, table, mailer, links, unpaidThresholdDays, clock, coachId -> {
            throw new IllegalStateException("no reconciler: this function doesn't run the drift check");
        });
    }

    public ScheduledRuns(String function, TenantClients clients, String table, Mailer mailer, NotificationService.Links links,
                         Supplier<Integer> unpaidThresholdDays, Clock clock, Reconciler reconciler) {
        this.function = function;
        this.reconciler = reconciler;
        this.notify = new NotifyRepository(clients, table);
        this.notifications = new NotificationService(notify, mailer, links, clock);
        ScheduleRepository schedules = new ScheduleRepository(clients, table);
        CoachRepository coaches = new CoachRepository(clients, table);
        this.change = new ScheduleChangeService(schedules, coaches, clock);
        this.mailer = mailer;
        this.unpaidThresholdDays = unpaidThresholdDays;
        this.jobs = new ScheduledJobs(notify, notifications, change, mailer, null);
        PaymentService payments = new PaymentService(new PaymentRepository(clients, table), schedules,
                new StudentRepository(clients, table), coaches, clock);
        this.yearClose = new ClosedYearJob(notify, new FinancialService(payments, coaches, new FinancialRepository(clients, table), clock));
        // No in-process seat events on AWS: consumer-invite follows the sweep's writes through the stream.
        this.sweep = new DeadlineSweepService(new ShareRepository(clients, table), SeatEvents.NONE);
    }

    /** On Lambda, from the function's environment (set by {@code infra/lib/jobs.ts}). */
    public static ScheduledRuns fromEnvironment() {
        return fromEnvironment(System::getenv);
    }

    static ScheduledRuns fromEnvironment(Function<String, String> env) {
        String function = required(env, "AWS_LAMBDA_FUNCTION_NAME");
        AccessLog.install(CloudWatchAccessLog.aws(required(env, "BLADEBOOK_ACCESSLOGGROUP"), function), Clock.systemUTC());
        String from = env.apply("BLADEBOOK_MAIL_FROM");
        Mailer mailer = from == null || from.isBlank() ? Mailer.none(function)
                : SesMailer.aws(new SesMailer.Senders(from, required(env, "BLADEBOOK_MAIL_NOREPLY")));
        String parameter = env.apply("BLADEBOOK_UNPAIDTHRESHOLDPARAMETER");
        Supplier<Integer> threshold = parameter == null || parameter.isBlank() ? () -> null : parameterStore(parameter);
        return new ScheduledRuns(function, TenantClients.consumer(), required(env, "BLADEBOOK_TABLE"), mailer,
                new NotificationService.Links(required(env, "BLADEBOOK_COACHSITEURL"), required(env, "BLADEBOOK_FAMILYSITEURL")),
                threshold, Clock.systemUTC(), lambdaReconciler(env.apply("BLADEBOOK_RECONCILEFUNCTION")));
    }

    /** Invokes {@code consumer-schedule-change} with {@code {"reconcile": coachId}} and waits for it; none if unset. */
    private static Reconciler lambdaReconciler(String fn) {
        if (fn == null || fn.isBlank()) {
            return coachId -> {
                throw new IllegalStateException("BLADEBOOK_RECONCILEFUNCTION is not set");
            };
        }
        LambdaClient lambda = LambdaClient.builder().httpClient(UrlConnectionHttpClient.create())
                .region(new DefaultAwsRegionProviderChain().getRegion()).build();
        return coachId -> {
            InvokeResponse r = lambda.invoke(i -> i.functionName(fn).invocationType(InvocationType.REQUEST_RESPONSE)
                    .payload(SdkBytes.fromUtf8String(JSON.writeValueAsString(Map.of("reconcile", coachId)))));
            if (r.functionError() != null) {
                throw new IllegalStateException("consumer-schedule-change failed for a coach: " + r.functionError());
            }
        };
    }

    /** The threshold from Parameter Store; a missing or blank parameter means no threshold, so nothing is sent. */
    private static Supplier<Integer> parameterStore(String name) {
        SsmClient ssm = SsmClient.builder().httpClient(UrlConnectionHttpClient.create())
                .region(new DefaultAwsRegionProviderChain().getRegion()).build();
        return () -> {
            try {
                return threshold(ssm.getParameter(r -> r.name(name)).parameter().value());
            } catch (ParameterNotFoundException e) {
                return null;
            }
        };
    }

    /** A threshold setting's value: whole days, or blank for none. */
    static Integer threshold(String value) {
        return value == null || value.isBlank() ? null : Integer.valueOf(value.trim());
    }

    private static String required(Function<String, String> env, String name) {
        String v = env.apply(name);
        if (v == null || v.isBlank()) {
            throw new IllegalStateException(name + " is not set");
        }
        return v;
    }

    /**
     * One run, from the Scheduler's input: {@code {"job": "<rule name>", "scheduledTime": "<ISO instant>"}}. Throws if the
     * job fails, an email it didn't get accepted included, so Lambda retries it (or, for a job with a queue, puts it there).
     */
    public Outcome run(String json) {
        JsonNode in = JSON.readTree(Objects.requireNonNull(json, "json"));
        if (!in.has("job") || !in.has("scheduledTime")) {
            throw new IllegalArgumentException("a Scheduler input needs job and scheduledTime");
        }
        return run(Job.ofRule(in.get("job").asString()), Instant.parse(in.get("scheduledTime").asString()));
    }

    Outcome run(Job job, Instant scheduledTime) {
        LocalDate date = LocalDate.ofInstant(scheduledTime, LAUNCH);
        Map<String, Integer> counts = new LinkedHashMap<>();
        try {
            return run(job, scheduledTime, date, counts);
        } catch (RuntimeException e) {
            // It read what it needed before failing (an email not accepted, say): the line is still written, with no
            // counts, then the run fails and the Scheduler retries it (ADR-MASTER section 19).
            AccessLog.jobRun(function, job.rule, date, Map.of(), FIELDS.get(job));
            throw e;
        }
    }

    private Outcome run(Job job, Instant scheduledTime, LocalDate date, Map<String, Integer> counts) {
        switch (job) {
            case DAY_REMINDER -> {
                ScheduledJobs.DayOf r = jobs.dayOf(date);
                counts.put("familyReminders", r.reminders());
                counts.put("morningEmails", r.morningEmails());
            }
            case UNPAID_REMINDER -> {
                ScheduledJobs.Unpaid r = new ScheduledJobs(notify, notifications, change, mailer, unpaidThresholdDays.get()).unpaid(date);
                counts.put("emails", r.emails());
                counts.put("lessons", r.lessons());
            }
            case LESSON_ROLLER -> {
                ScheduledJobs.Rolled r = jobs.roll(date);
                counts.put("coaches", r.coaches());
                counts.put("lessonTimesAdded", r.added());
            }
            case YEAR_CLOSE -> {
                ClosedYearJob.Result r = yearClose.run(date);
                counts.put("coaches", r.coaches());
                counts.put("saved", r.saved());
                counts.put("alreadySaved", r.alreadySaved());
                counts.put("notClosedYet", r.notClosedYet());
            }
            case DRIFT_CHECK -> {
                driftCheck(date, counts);
                AccessLog.jobRun(function, job.rule, date, counts, FIELDS.get(job));
                Map<String, Integer> metrics = new LinkedHashMap<>();
                metrics.put(job.metric, 1);
                metrics.put("DriftReconcileFailed", counts.get("reconcileFailed"));
                metrics.put("DriftMissedCancellations", counts.get("missedCancellations"));
                metrics.put("DriftOutstandingReprices", counts.get("outstandingReprices"));
                return new Outcome(job, date, Map.copyOf(counts), metricLine(metrics, function, Instant.now()));
            }
            case DEADLINE_SWEEP -> {
                DeadlineSweepService.Swept r = sweep.sweep(scheduledTime.truncatedTo(ChronoUnit.SECONDS));
                counts.put("expired", r.expired());
                counts.put("cancelledNoAnswer", r.cancelledNoAnswer());
                counts.put("cleared", r.cleared());
            }
        }
        AccessLog.jobRun(function, job.rule, date, counts, FIELDS.get(job));
        return new Outcome(job, date, Map.copyOf(counts), job.metric == null ? null : metricLine(job.metric, function, Instant.now()));
    }

    /**
     * {@code sched-drift-check} (ADR-MASTER section 19), reading only: every coach with booked lessons in the next
     * {@value #DRIFT_DAYS} days (through GSI2). A coach with a batch stuck for over an hour is handed to
     * {@code consumer-schedule-change} to finish, then checked again. What's left is counted: a failed finish and a lesson
     * that should have been cancelled page; outstanding re-prices go on the dashboard (piece 7's alarms read the metrics).
     */
    private void driftCheck(LocalDate date, Map<String, Integer> counts) {
        java.util.Set<String> coaches = new java.util.TreeSet<>();
        for (int i = 0; i < DRIFT_DAYS; i++) {
            notify.seatsOn(date.plusDays(i)).forEach(r -> coaches.add(r.seat().coachId()));
        }
        int reconciled = 0, failed = 0, missed = 0, reprices = 0;
        for (String coachId : coaches) {
            com.bladebook.core.data.AccessContext ctx = new com.bladebook.core.data.AccessContext(coachId);
            ScheduleChangeService.Drift d = change.drift(ctx);
            if (d.stuckBatches() > 0) {
                try {
                    reconciler.reconcile(coachId);
                    reconciled++;
                } catch (RuntimeException e) {
                    failed++;
                }
                d = change.drift(ctx);
            }
            missed += d.missedCancellations();
            reprices += d.outstandingReprices();
        }
        counts.put("coaches", coaches.size());
        counts.put("reconciled", reconciled);
        counts.put("reconcileFailed", failed);
        counts.put("missedCancellations", missed);
        counts.put("outstandingReprices", reprices);
    }

    /**
     * CloudWatch's embedded metric format: a log line CloudWatch turns into the metric, by function, with no permission or
     * call needed (ADR-MASTER section 19's completion metrics).
     */
    static String metricLine(String metric, String function, Instant at) {
        return metricLine(Map.of(metric, 1), function, at);
    }

    static String metricLine(Map<String, Integer> metrics, String function, Instant at) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("_aws", Map.of("Timestamp", at.toEpochMilli(), "CloudWatchMetrics", List.of(Map.of(
                "Namespace", NAMESPACE, "Dimensions", List.of(List.of("Function")),
                "Metrics", metrics.keySet().stream().map(n -> Map.of("Name", n, "Unit", "Count")).toList()))));
        m.put("Function", function);
        m.putAll(metrics);
        return JSON.writeValueAsString(m);
    }
}
