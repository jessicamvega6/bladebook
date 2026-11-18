// The alarms (ADR-MASTER §16, §19; ADR-010 d4, ADR-024): what pages the owner, and the morning dashboard for the rest.
//
// - One paging topic. Pages go to the owner's phone by text; until the account can send US texts, it also emails the
//   owner (owner, 2026-11-18, I26). The phone and the address are deploy-time settings, never in the repo.
// - Alarms live in production permanently; in dev they're switched on only to prove they fire (`-c alarms=on`).
// - The never-linked counts read the access log's security lines (I12): a metric filter for everyone in a day, and a
//   Contributor Insights rule for one family in a fixed 15-minute period.
// - The up-check (production only, I26) calls the coach site's home page and the API's /health from US locations
//   only, so the US-only rule lets it in.

import { Duration, Stack, Validations } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as pipes from 'aws-cdk-lib/aws-pipes';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

/** The thresholds ADR-MASTER §16 and §19 give, as configuration. */
export const THRESHOLDS = {
  /** One family's never-linked failures in a fixed 15-minute period. */
  neverLinkedOneFamily: 3,
  /** Everyone's never-linked failures in a day. */
  neverLinkedADay: 10,
  /** "Approaching" SES's 5% bounce and 0.1% complaint limits. */
  sesBounceRate: 0.04,
  sesComplaintRate: 0.0008,
  /** Stream records waiting this long mean the Pipe or the archiver has stalled. */
  iteratorAgeMs: 15 * 60 * 1000,
} as const;

/** The completion and finding metrics the jobs report (core.events.ScheduledRuns), by function. */
const NAMESPACE = 'BladeBook';

export interface AlarmsProps {
  readonly prefix: string;
  /** Deploy-time settings (I26): the owner's phone for texts, and an address while texts can't be sent. */
  readonly pagePhone?: string;
  readonly pageEmail?: string;
  readonly consumers: ReadonlyMap<string, lambda.IFunction>;
  readonly consumerDeadLetters: ReadonlyMap<string, sqs.IQueue>;
  readonly jobs: ReadonlyMap<string, lambda.IFunction>;
  readonly jobDeadLetters: ReadonlyMap<string, sqs.IQueue>;
  readonly pipe: pipes.CfnPipe;
  readonly pipeDeadLetters: sqs.IQueue;
  readonly ttlArchiver: lambda.IFunction;
  readonly accessLog: logs.ILogGroup;
  /** The up-check's targets; none in dev unless switched on. */
  readonly upCheck?: { readonly siteHost: string; readonly apiHost: string };
}

export class Alarms extends Construct {
  readonly topic: sns.Topic;
  readonly dashboard: cloudwatch.Dashboard;
  /** Every alarm that pages, by name. */
  readonly paging = new Map<string, cloudwatch.Alarm>();

  constructor(scope: Construct, id: string, props: AlarmsProps) {
    super(scope, id);
    this.topic = new sns.Topic(this, 'Pages', {
      topicName: `${props.prefix}-pages`,
      displayName: 'BladeBook',
      enforceSSL: true,
    });
    // enforceSSL gives the topic a policy, which replaces SNS's default one, so CloudWatch must be let in explicitly:
    // this account's alarms with this environment's prefix only (found proving the alarms in dev, 2026-11-18).
    const { account, region, partition } = Stack.of(this);
    this.topic.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AlarmsMayPage',
      principals: [new iam.ServicePrincipal('cloudwatch.amazonaws.com')],
      actions: ['sns:Publish'],
      resources: [this.topic.topicArn],
      conditions: {
        StringEquals: { 'aws:SourceAccount': account },
        ArnLike: { 'aws:SourceArn': `arn:${partition}:cloudwatch:${region}:${account}:alarm:${props.prefix}-*` },
      },
    }));
    if (props.pagePhone) this.topic.addSubscription(new subs.SmsSubscription(props.pagePhone));
    if (props.pageEmail) this.topic.addSubscription(new subs.EmailSubscription(props.pageEmail));
    Validations.of(this.topic).acknowledge({
      id: 'AwsSolutions-SNS2',
      reason: 'Alarm pages carry no personal data (metric names and counts); CloudWatch alarms can\'t publish to a topic under the AWS-managed SNS key.',
    });
    const page = new actions.SnsAction(this.topic);
    const fnMetric = (fn: lambda.IFunction, metric: string, period: Duration) =>
      new cloudwatch.Metric({ namespace: NAMESPACE, metricName: metric, dimensionsMap: { Function: fn.functionName },
        statistic: 'Sum', period });
    const alarm = (name: string, metric: cloudwatch.IMetric, o: {
      threshold: number; op: cloudwatch.ComparisonOperator; periods?: number; missing?: cloudwatch.TreatMissingData;
      description: string;
    }) => {
      const a = new cloudwatch.Alarm(this, name, {
        alarmName: `${props.prefix}-${name}`,
        alarmDescription: o.description,
        metric,
        threshold: o.threshold,
        comparisonOperator: o.op,
        evaluationPeriods: o.periods ?? 1,
        datapointsToAlarm: o.periods ?? 1,
        treatMissingData: o.missing ?? cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      a.addAlarmAction(page);
      this.paging.set(name, a);
      return a;
    };
    const BELOW = cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD;
    const AT_LEAST = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;
    const ABOVE = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD;
    const BREACHING = cloudwatch.TreatMissingData.BREACHING;
    const job = (name: string) => {
      const fn = props.jobs.get(name);
      if (!fn) throw new Error(`no ${name}`);
      return fn;
    };

    // --------------------------------------------------------------- scheduled jobs: a dead man's switch (§19)
    alarm('day-reminder-missed', job('sched-day-reminder').metricInvocations({ period: Duration.days(1), statistic: 'Sum' }),
      { threshold: 1, op: BELOW, missing: BREACHING, description: 'The 7am reminder didn\'t run today (ADR-MASTER §19).' });
    alarm('unpaid-reminder-missed', job('sched-unpaid-reminder').metricInvocations({ period: Duration.days(1), statistic: 'Sum' }),
      { threshold: 1, op: BELOW, periods: 7, missing: BREACHING, description: 'The Monday unpaid reminder hasn\'t run for a week.' });
    alarm('drift-check-missed', job('sched-drift-check').metricInvocations({ period: Duration.days(1), statistic: 'Sum' }),
      { threshold: 1, op: BELOW, missing: BREACHING, description: 'The nightly drift check didn\'t run (I25).' });
    alarm('sweep-missed', fnMetric(job('sched-deadline-sweep'), 'DeadlineSweepCompleted', Duration.hours(1)),
      { threshold: 1, op: BELOW, periods: 2, missing: BREACHING, description: 'No completed deadline sweep for 2 hours (§19).' });
    alarm('roller-missed', fnMetric(job('sched-lesson-roller'), 'LessonRollerCompleted', Duration.days(1)),
      { threshold: 1, op: BELOW, periods: 3, missing: BREACHING, description: 'No completed lesson roller for 3 nights (§19).' });

    // ------------------------------------------------------------------------ the drift check's findings (I25)
    const drift = job('sched-drift-check');
    alarm('drift-finish-failed', fnMetric(drift, 'DriftReconcileFailed', Duration.days(1)),
      { threshold: 1, op: AT_LEAST, description: 'A stuck change batch couldn\'t be finished (§19).' });
    alarm('drift-missed-cancellation', fnMetric(drift, 'DriftMissedCancellations', Duration.days(1)),
      { threshold: 1, op: AT_LEAST, description: 'A lesson that should have been cancelled wasn\'t (§19).' });

    // -------------------------------------------------------------------------------------- queues and streams
    for (const name of ['consumer-change-notifier', 'consumer-schedule-change']) {
      const q = props.consumerDeadLetters.get(name);
      if (!q) throw new Error(`no queue for ${name}`);
      alarm(`${name.replace('consumer-', '')}-queue`, q.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: 'Maximum' }),
        { threshold: 0, op: ABOVE, description: `${name}'s dead-letter queue has a message (§19: ${name === 'consumer-schedule-change' ? 'reconcile, never replay' : 'replay at once'}).` });
    }
    // If the Pipe stalls, no consumer runs and no consumer alarm fires (§19).
    alarm('pipe-queue', props.pipeDeadLetters.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: 'Maximum' }),
      { threshold: 0, op: ABOVE, description: 'The Pipe couldn\'t put stream records on the bus.' });
    alarm('pipe-failing', new cloudwatch.Metric({ namespace: 'AWS/EventBridge/Pipes', metricName: 'ExecutionFailed',
      dimensionsMap: { PipeName: props.pipe.name! }, statistic: 'Sum', period: Duration.minutes(15) }),
    { threshold: 1, op: AT_LEAST, description: 'The Pipe is failing to put stream records on the bus.' });
    alarm('archiver-behind', props.ttlArchiver.metric('IteratorAge', { period: Duration.minutes(5), statistic: 'Maximum' }),
      { threshold: THRESHOLDS.iteratorAgeMs, op: ABOVE, periods: 3, description: 'The TTL archiver is falling behind the stream.' });

    // ------------------------------------------------------------------------------------------- SES (§19)
    const ses = (metricName: string) => new cloudwatch.Metric({ namespace: 'AWS/SES', metricName, statistic: 'Maximum', period: Duration.hours(1) });
    alarm('ses-bounces', ses('Reputation.BounceRate'), { threshold: THRESHOLDS.sesBounceRate, op: AT_LEAST, description: 'SES bounce rate approaching 5%.' });
    alarm('ses-complaints', ses('Reputation.ComplaintRate'), { threshold: THRESHOLDS.sesComplaintRate, op: AT_LEAST, description: 'SES complaint rate approaching 0.1%.' });

    // ------------------------------------------------------------------- never-linked families (§16; I12)
    const neverLinked = new logs.MetricFilter(this, 'NeverLinked', {
      logGroup: props.accessLog,
      filterPattern: logs.FilterPattern.stringValue('$.operation', '=', 'security:never-linked*'),
      metricNamespace: NAMESPACE,
      metricName: 'NeverLinked',
      metricValue: '1',
    });
    alarm('never-linked-a-day', neverLinked.metric({ statistic: 'Sum', period: Duration.days(1) }),
    { threshold: THRESHOLDS.neverLinkedADay, op: AT_LEAST, description: '10 or more never-linked asks across every family today (§16).' });
    const rule = new cloudwatch.CfnInsightRule(this, 'NeverLinkedByFamily', {
      ruleName: `${props.prefix}-never-linked-by-family`,
      ruleState: 'ENABLED',
      ruleBody: JSON.stringify({
        Schema: { Name: 'CloudWatchLogRule', Version: 1 },
        LogGroupNames: [props.accessLog.logGroupName],
        LogFormat: 'JSON',
        Contribution: { Keys: ['$.actor'], Filters: [{ Match: '$.operation', StartsWith: ['security:never-linked'] }] },
        AggregateOn: 'Count',
      }),
    });
    alarm('never-linked-one-family', new cloudwatch.MathExpression({
      expression: `INSIGHT_RULE_METRIC("${rule.ruleName}", "MaxContributorValue")`,
      period: Duration.minutes(15),
      label: 'The most never-linked asks by one family',
    }), { threshold: THRESHOLDS.neverLinkedOneFamily, op: AT_LEAST, description: 'One family made 3 or more never-linked asks in 15 minutes (§16).' });

    // ---------------------------------------------------------------------------- the up-check (§19; I26)
    if (props.upCheck) {
      const check = (cid: string, host: string, path: string) => {
        const hc = new route53.CfnHealthCheck(this, cid, {
          healthCheckConfig: {
            type: 'HTTPS', fullyQualifiedDomainName: host, resourcePath: path, port: 443,
            requestInterval: 30, failureThreshold: 3,
            // The US-only rule refuses anywhere else (ADR-019).
            regions: ['us-east-1', 'us-west-1', 'us-west-2'],
          },
        });
        alarm(`${cid}-down`, new cloudwatch.Metric({ namespace: 'AWS/Route53', metricName: 'HealthCheckStatus',
          dimensionsMap: { HealthCheckId: hc.attrHealthCheckId }, statistic: 'Minimum', period: Duration.minutes(1) }),
        { threshold: 1, op: BELOW, periods: 3, missing: BREACHING, description: `${host}${path} isn't answering (§19).` });
      };
      check('up-site', props.upCheck.siteHost, '/');
      check('up-api', props.upCheck.apiHost, '/api/coach/health');
    }

    // ----------------------------------------------------------------------- the morning dashboard (§19)
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', { dashboardName: `${props.prefix}-morning` });
    const queues = [...props.consumerDeadLetters, ...props.jobDeadLetters].map(([name, q]) =>
      q.metricApproximateNumberOfMessagesVisible({ label: name, period: Duration.hours(1), statistic: 'Maximum' }));
    this.dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({ title: 'Pages', alarms: [...this.paging.values()], width: 24 }),
      new cloudwatch.GraphWidget({ title: 'Dead-letter queues', left: queues, width: 12 }),
      new cloudwatch.GraphWidget({ title: 'Jobs completed', width: 12, left: [
        fnMetric(job('sched-lesson-roller'), 'LessonRollerCompleted', Duration.days(1)),
        fnMetric(job('sched-lesson-roller'), 'YearCloseCompleted', Duration.days(1)),
        fnMetric(drift, 'DriftCheckCompleted', Duration.days(1)),
      ] }),
      new cloudwatch.GraphWidget({ title: 'Drift check: re-prices outstanding', width: 12,
        left: [fnMetric(drift, 'DriftOutstandingReprices', Duration.days(1))] }),
      new cloudwatch.GraphWidget({ title: 'Consumer errors', width: 12,
        left: [...props.consumers].map(([name, fn]) => fn.metricErrors({ label: name, period: Duration.hours(1) })) }),
    );
  }
}
