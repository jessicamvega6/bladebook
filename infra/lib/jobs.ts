// The scheduled jobs (ADR-MASTER §2, §14, §19): EventBridge Scheduler invokes each `sched-*` function directly, in the
// launch time zone (America/Chicago, I7), with the time it was scheduled for; nothing goes through the bus. Each schedule
// is named after its rule. The roller's function also runs the year close, on a second schedule (Batch 26).
//
// - The reminders have a dead-letter queue (discarded once their date has passed). The roller, the year close and the
//   sweep have none: each is safe to run twice, and its completion metric drives its missed-run alarm (piece 7).
// - Each role grants what its code calls, held by leading key to the partitions it touches (owner, 2026-11-18, I23).
//   The cross-coach indexes stay with the jobs that need them: GSI2 the reminder, GSI3 the unpaid list, GSI4 the sweep.

import { Duration } from 'aws-cdk-lib';
import type { RemovalPolicy } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { backendCode } from './api.ts';
import { backendFunction, deadLetterQueue } from './backend-function.ts';
import type { Email } from './email.ts';

/** The launch time zone every schedule uses (owner, 2026-11-17, I7). */
export const LAUNCH_TZ = 'America/Chicago';

const COACH = 'COACH#*';
const CLIENT = 'CLIENT#*';

const keys = (actions: string[], resource: string, prefixes: string[]): iam.PolicyStatement => new iam.PolicyStatement({
  actions: actions.map((a) => `dynamodb:${a}`),
  resources: [resource],
  conditions: { 'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': prefixes } },
});

export interface JobSpec {
  readonly name: string;
  readonly handler: string;
  readonly description: string;
  readonly templates: readonly string[];
  readonly dynamo: (table: string) => iam.PolicyStatement[];
  /** Each schedule this function runs on: its rule name and cron expression (Scheduler's syntax). */
  readonly schedules: readonly { readonly rule: string; readonly cron: string }[];
  readonly deadLetters: boolean;
  readonly timeout: Duration;
}

export const JOBS: readonly JobSpec[] = [
  {
    name: 'sched-day-reminder', handler: 'DayReminder', templates: ['day-of-reminder', 'coach-morning'],
    description: '~7:00 AM: the families\' day-of reminders and the coaches\' morning emails',
    dynamo: (t) => [
      keys(['Query'], `${t}/index/GSI2`, ['DATE#*']),
      keys(['GetItem'], t, [COACH, CLIENT]),
      keys(['UpdateItem'], t, [COACH]),
    ],
    schedules: [{ rule: 'sched-day-reminder', cron: 'cron(0 7 * * ? *)' }],
    deadLetters: true, timeout: Duration.minutes(5),
  },
  {
    name: 'sched-unpaid-reminder', handler: 'UnpaidReminder', templates: ['coach-unpaid-weekly'],
    description: 'Monday morning: long-unpaid lessons, to the coach',
    dynamo: (t) => [
      new iam.PolicyStatement({ actions: ['dynamodb:Scan'], resources: [`${t}/index/GSI3`] }),
      keys(['GetItem', 'Query', 'UpdateItem'], t, [COACH]),
    ],
    schedules: [{ rule: 'sched-unpaid-reminder', cron: 'cron(0 8 ? * MON *)' }],
    deadLetters: true, timeout: Duration.minutes(5),
  },
  {
    name: 'sched-lesson-roller', handler: 'LessonRoller', templates: [],
    description: 'nightly: lesson times stored ~15 months ahead; and sched-year-close, January 1 to 7',
    dynamo: (t) => [
      // Listing the coaches: the keys only (ADR-MASTER §2).
      new iam.PolicyStatement({
        actions: ['dynamodb:Scan'],
        resources: [t],
        conditions: {
          'ForAllValues:StringEquals': { 'dynamodb:Attributes': ['PK', 'SK'] },
          StringEquals: { 'dynamodb:Select': 'SPECIFIC_ATTRIBUTES' },
        },
      }),
      // Only adds: lesson times and CLOSEDYEAR# items, each under attribute_not_exists (held by the code).
      keys(['GetItem', 'Query', 'PutItem'], t, [COACH]),
    ],
    schedules: [
      { rule: 'sched-lesson-roller', cron: 'cron(30 2 * * ? *)' },
      // 8:00 AM Central is after midnight everywhere a coach can be (Batch 26).
      { rule: 'sched-year-close', cron: 'cron(0 8 1-7 1 ? *)' },
    ],
    deadLetters: false, timeout: Duration.minutes(10),
  },
  {
    name: 'sched-deadline-sweep', handler: 'DeadlineSweep', templates: [],
    description: 'hourly: shared-lesson deadlines (GSI4)',
    dynamo: (t) => [
      keys(['Query'], `${t}/index/GSI4`, ['DUE']),
      keys(['GetItem', 'PutItem', 'UpdateItem', 'DeleteItem'], t, [COACH]),
    ],
    schedules: [{ rule: 'sched-deadline-sweep', cron: 'cron(0 * * * ? *)' }],
    deadLetters: false, timeout: Duration.minutes(5),
  },
];

export interface JobsProps {
  readonly prefix: string;
  readonly table: dynamodb.ITable;
  readonly accessLog: logs.ILogGroup;
  readonly coachSiteUrl: string;
  readonly familySiteUrl: string;
  readonly email?: Email;
  /** The weekly unpaid reminder's threshold in days, held in Parameter Store (ADR-MASTER §12). */
  readonly unpaidThresholdDays: number;
  readonly removalPolicy: RemovalPolicy;
}

export class Jobs extends Construct {
  readonly functions = new Map<string, lambda.Function>();
  readonly deadLetters = new Map<string, sqs.Queue>();
  readonly unpaidThreshold: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: JobsProps) {
    super(scope, id);
    const code = backendCode(this, 'consumers');
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'EventBridge Scheduler: invokes the sched-* functions (ADR-MASTER §14).',
    });

    // ADR-MASTER §12: the job reads it on every run, so it can be changed without a deploy (a deploy sets it back).
    this.unpaidThreshold = new ssm.StringParameter(this, 'UnpaidThreshold', {
      parameterName: `/${props.prefix}/unpaid-reminder/threshold-days`,
      description: 'sched-unpaid-reminder: lessons unpaid longer than this many days are listed (ADR-MASTER §12). Blank: none.',
      stringValue: String(props.unpaidThresholdDays),
    });

    for (const spec of JOBS) {
      const deadLetters = spec.deadLetters ? deadLetterQueue(this, `${spec.handler}DeadLetters`, props.removalPolicy) : undefined;
      const fn = backendFunction(this, {
        prefix: props.prefix, name: spec.name, handler: spec.handler, description: spec.description, code,
        table: props.table, dynamo: spec.dynamo(props.table.tableArn), accessLog: props.accessLog,
        coachSiteUrl: props.coachSiteUrl, familySiteUrl: props.familySiteUrl,
        templates: spec.templates, ...(props.email ? { email: props.email } : {}),
        timeout: spec.timeout, ...(deadLetters ? { deadLetters } : {}), removalPolicy: props.removalPolicy,
        ...(spec.name === 'sched-unpaid-reminder'
          ? { environment: { BLADEBOOK_UNPAIDTHRESHOLDPARAMETER: this.unpaidThreshold.parameterName } }
          : {}),
      });
      if (spec.name === 'sched-unpaid-reminder') {
        fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [this.unpaidThreshold.parameterArn] }));
      }
      // The function itself, not its versions: Scheduler invokes the plain ARN.
      schedulerRole.addToPolicy(new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [fn.functionArn] }));
      deadLetters?.grantSendMessages(schedulerRole);

      for (const s of spec.schedules) {
        new scheduler.CfnSchedule(this, `${s.rule}Schedule`, {
          name: `${props.prefix}-${s.rule}`,
          description: `${s.rule} (ADR-MASTER §14)`,
          scheduleExpression: s.cron,
          scheduleExpressionTimezone: LAUNCH_TZ,
          flexibleTimeWindow: { mode: 'OFF' },
          target: {
            arn: fn.functionArn,
            roleArn: schedulerRole.roleArn,
            // The time it's for, which the job turns into its date: a re-run or a late run works on its own date.
            input: JSON.stringify({ job: s.rule, scheduledTime: '<aws.scheduler.scheduled-time>' }),
            retryPolicy: { maximumRetryAttempts: 2, maximumEventAgeInSeconds: 3600 },
            ...(deadLetters ? { deadLetterConfig: { arn: deadLetters.queueArn } } : {}),
          },
        });
      }
      this.functions.set(spec.name, fn);
      if (deadLetters) this.deadLetters.set(spec.name, deadLetters);
    }
  }
}
