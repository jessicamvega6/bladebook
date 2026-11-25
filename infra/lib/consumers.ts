// The event backbone (ADR-MASTER §2, §3, §19; owner, 2026-11-17, I6): the table's stream → one EventBridge Pipe → the
// application's own bus → one rule per named event → its consumer function.
//
// - The Pipe forwards each stream record unchanged (no enrichment) and drops TTL removals, which only the archiver
//   reads (Batch 17b, piece 6). Its own dead-letter queue catches records it couldn't put on the bus.
// - Each rule's pattern matches the raw record; `EVENT_PATTERNS` is exported so the tests run sample records against it.
// - Each consumer has its own execution role (written from what its code calls), its own log group, and one
//   dead-letter queue for both a rule that couldn't invoke it and an invocation that failed after Lambda's retries.

import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { backendCode } from './api.ts';
import { backendFunction, deadLetterQueue } from './backend-function.ts';
import type { Email } from './email.ts';

/** What the Pipe sets on every event it puts on the bus. */
export const PIPE_SOURCE = 'bladebook.table';
export const PIPE_DETAIL_TYPE = 'TableRecord';

type Pattern = Record<string, unknown>;

const key = (attr: 'PK' | 'SK', ...prefixes: string[]): Pattern => ({ [attr]: { S: prefixes.map((prefix) => ({ prefix })) } });
/** The new image has `value` and the old one doesn't (absent, or another value): a transition into `value`. */
const becomes = (attr: string, value: string): Pattern => ({
  NewImage: { [attr]: { S: [value] } },
  $or: [{ OldImage: { [attr]: { S: [{ exists: false }] } } }, { OldImage: { [attr]: { S: [{ 'anything-but': value }] } } }],
});

/**
 * Each named event's pattern on the stream record (`detail`), ADR-MASTER §3. A consumer re-reads the item and checks its
 * guard, so a pattern may match a little more than its event; it must never miss one.
 */
export const EVENT_PATTERNS: Record<string, Pattern> = {
  // A booking request's marker written (one per request, listing the seats it booked; owner, 2026-11-25). A retry of the
  // request writes it again: the consumer's guards send nothing twice.
  LessonBooked: {
    eventName: ['INSERT', 'MODIFY'],
    dynamodb: { Keys: { ...key('PK', 'COACH#'), ...key('SK', 'BOOKED#') } },
  },
  // An attendance write of CHECKED_IN.
  CheckInRecorded: {
    eventName: ['INSERT', 'MODIFY'],
    dynamodb: { Keys: { ...key('PK', 'COACH#'), ...key('SK', 'SEAT#') }, ...becomes('seatStatus', 'CHECKED_IN') },
  },
  // A weekly schedule or a date override written or removed.
  ScheduleChanged: {
    dynamodb: { Keys: { ...key('PK', 'COACH#'), ...key('SK', 'SCHEDULE#DEFAULT', 'SCHEDULE#DATE#') } },
  },
  // A change batch's header reaching EXECUTED.
  LessonsChanged: {
    eventName: ['INSERT', 'MODIFY'],
    dynamodb: { Keys: { ...key('PK', 'COACH#'), ...key('SK', 'CHANGEBATCH#') }, ...becomes('executionStatus', 'EXECUTED') },
  },
  // The coach's answer to a PENDING skater: approved (ACTIVE) or declined (the record removed). A name change does
  // nothing in the consumer, so it isn't matched.
  StudentChanged: {
    dynamodb: { Keys: { ...key('PK', 'COACH#'), ...key('SK', 'STUDENT#') }, OldImage: { studentStatus: { S: ['PENDING'] } } },
    $or: [
      { eventName: ['REMOVE'] },
      { eventName: ['MODIFY'], dynamodb: { NewImage: { studentStatus: { S: ['ACTIVE'] } } } },
    ],
  },
  // A family's profile or skater created or modified (a new skater needs its share code).
  FamilyChanged: {
    eventName: ['INSERT', 'MODIFY'],
    dynamodb: { Keys: { ...key('PK', 'CLIENT#'), SK: { S: ['PROFILE', { prefix: 'SKATER#' }] } } },
  },
  // Any seat or ended invitation, or a lesson time whose pendingLeave is written or cleared (ADR-MASTER §8). Also the
  // markers a booking request and an accepted invitation write after their dates: the booking's invitation and the "joined"
  // emails are each sent once, from them (owner, 2026-11-25).
  SharedLessonChanged: {
    dynamodb: { Keys: key('PK', 'COACH#') },
    $or: [
      { dynamodb: { Keys: key('SK', 'SEAT#', 'SEATEND#') } },
      { eventName: ['INSERT', 'MODIFY'], dynamodb: { Keys: key('SK', 'BOOKED#', 'JOINED#') } },
      { dynamodb: { Keys: key('SK', 'LESSON#'), NewImage: { pendingLeave: { M: { leaveId: { S: [{ exists: true }] } } } } } },
      { dynamodb: { Keys: key('SK', 'LESSON#'), OldImage: { pendingLeave: { M: { leaveId: { S: [{ exists: true }] } } } } } },
    ],
  },
};

/** The Pipe's filter: every record except a TTL removal, whose identity is the DynamoDB service (ADR-MASTER §3). */
export const PIPE_FILTER: Pattern = {
  $or: [
    { eventName: ['INSERT', 'MODIFY'] },
    { eventName: ['REMOVE'], userIdentity: { type: [{ exists: false }] } },
  ],
};

/** The archiver's filter: removals by the DynamoDB service, which are TTL's (ADR-MASTER §3, §20). */
export const TTL_FILTER = {
  eventName: lambda.FilterRule.isEqual('REMOVE'),
  userIdentity: { type: lambda.FilterRule.isEqual('Service'), principalId: lambda.FilterRule.isEqual('dynamodb.amazonaws.com') },
};

/** One consumer function (ADR-MASTER §2). */
export interface ConsumerSpec {
  /** Without the environment prefix: `consumer-…`. */
  readonly name: string;
  /** The handler class in `com.bladebook.consumers.handler`. */
  readonly handler: string;
  readonly event: keyof typeof EVENT_PATTERNS;
  /** The SES templates it may send (none: no SES). */
  readonly templates: readonly string[];
  /** Its DynamoDB statements, given the table's ARN. */
  readonly dynamo: (table: string) => iam.PolicyStatement[];
  readonly timeout?: Duration;
}

/** Item actions on the table (or `index`), held to the partitions whose keys start with `prefixes`. */
const allow = (actions: string[], prefixes: string[], table: string, opts: { index?: string; attributes?: string[] } = {}) =>
  new iam.PolicyStatement({
    actions: actions.map((a) => `dynamodb:${a}`),
    resources: [opts.index ? `${table}/index/${opts.index}` : table],
    conditions: {
      'ForAllValues:StringLike': {
        'dynamodb:LeadingKeys': prefixes.map((p) => `${p}*`),
        ...(opts.attributes ? { 'dynamodb:Attributes': opts.attributes } : {}),
      },
    },
  });

const COACH = 'COACH#';
const CLIENT = 'CLIENT#';

/**
 * What `consumer-invite` may write on a seat or an ended invitation: the read-only copies (ADR-MASTER §8) and its own
 * email guards (owner, 2026-11-18). No PutItem or DeleteItem.
 */
export const INVITE_ATTRIBUTES = ['PK', 'SK', 'partnerName', 'partnerStatus', 'invitedClientId', 'GSI1PK', 'GSI1SK',
  'choiceAnswerBy', 'freedPlace', 'inviteEmailSent', 'joinedEmailSent', 'joinedHostEmailSent', 'emailSent'];

/**
 * ADR-MASTER §2's role table, written from what each consumer's code calls (owner, 2026-11-18): the actions it uses,
 * each held to the partitions it touches. A transaction's writes are checked as their item actions.
 */
export const CONSUMERS: readonly ConsumerSpec[] = [
  {
    name: 'consumer-booking-confirmation', handler: 'BookingConfirmation', event: 'LessonBooked',
    templates: ['booking-confirmation'],
    dynamo: (t) => [allow(['GetItem', 'Query'], [COACH, CLIENT], t), allow(['UpdateItem'], [COACH], t)],
  },
  {
    name: 'consumer-payment-reminder', handler: 'PaymentReminder', event: 'CheckInRecorded',
    templates: ['payment-reminder'],
    dynamo: (t) => [allow(['GetItem', 'Query'], [COACH, CLIENT], t), allow(['UpdateItem'], [COACH], t)],
  },
  {
    name: 'consumer-schedule-change', handler: 'ScheduleChange', event: 'ScheduleChanged', templates: [],
    // ConditionCheckItem: a re-price checks the seats it was planned for in its transaction (2026-11-21).
    dynamo: (t) => [allow(['GetItem', 'Query', 'PutItem', 'UpdateItem', 'DeleteItem', 'ConditionCheckItem'], [COACH], t)],
    timeout: Duration.minutes(5),
  },
  {
    name: 'consumer-change-notifier', handler: 'ChangeNotifier', event: 'LessonsChanged',
    templates: ['lesson-cancelled-by-coach', 'schedule-change', 'coach-lessons-passed', 'share-dates-cancelled',
      'coach-late-cancellation', 'share-other-cant-make-it'],
    dynamo: (t) => [allow(['GetItem', 'Query'], [COACH, CLIENT], t), allow(['UpdateItem'], [COACH], t)],
  },
  {
    name: 'consumer-student-link', handler: 'StudentLink', event: 'StudentChanged',
    templates: ['signup-declined'],
    dynamo: (t) => [allow(['GetItem'], [COACH, CLIENT], t), allow(['UpdateItem', 'DeleteItem'], [CLIENT], t)],
  },
  {
    name: 'consumer-family-sync', handler: 'FamilySync', event: 'FamilyChanged', templates: [],
    dynamo: (t) => [allow(['Query'], [CLIENT], t), allow(['UpdateItem'], [COACH, CLIENT], t),
      allow(['PutItem', 'DeleteItem'], ['SKATERCODE#'], t)],
  },
  {
    name: 'consumer-invite', handler: 'Invite', event: 'SharedLessonChanged',
    templates: ['share-invitation', 'share-joined', 'share-invitation-declined', 'share-invitation-withdrawn',
      'share-no-longer-available'],
    dynamo: (t) => [allow(['GetItem', 'Query'], [COACH, CLIENT], t), allow(['Query'], [CLIENT], t, { index: 'GSI1' }),
      allow(['UpdateItem'], [COACH], t, { attributes: INVITE_ATTRIBUTES })],
  },
];

export interface ConsumersProps {
  readonly prefix: string;
  readonly table: dynamodb.ITable;
  readonly accessLog: logs.ILogGroup;
  readonly coachSiteUrl: string;
  readonly familySiteUrl: string;
  /** The archive bucket `consumer-ttl-archiver` writes expired items to (ADR-MASTER §20). */
  readonly archive: s3.IBucket;
  /** The sending addresses; without them no consumer gets SES and those that email fail their events. */
  readonly email?: Email;
  readonly removalPolicy: RemovalPolicy;
}

export class Consumers extends Construct {
  readonly bus: events.EventBus;
  readonly pipe: pipes.CfnPipe;
  readonly pipeDeadLetters: sqs.Queue;
  readonly functions = new Map<string, lambda.Function>();
  readonly deadLetters = new Map<string, sqs.Queue>();
  readonly ttlArchiver: lambda.Function;

  constructor(scope: Construct, id: string, props: ConsumersProps) {
    super(scope, id);
    const table = props.table;
    if (!table.tableStreamArn) throw new Error('the table has no stream');

    this.bus = new events.EventBus(this, 'Bus', { eventBusName: `${props.prefix}-events` });

    // ---------------------------------------------------------------------------------------------------- the Pipe
    this.pipeDeadLetters = deadLetterQueue(this, 'PipeDeadLetters', props.removalPolicy);
    const pipeRole = new iam.Role(this, 'PipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
      description: 'The table stream Pipe: reads the stream, puts each record on the bus.',
    });
    pipeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator'],
      resources: [table.tableStreamArn],
    }));
    pipeRole.addToPolicy(new iam.PolicyStatement({ actions: ['dynamodb:ListStreams'], resources: ['*'] }));
    this.bus.grantPutEventsTo(pipeRole);
    this.pipeDeadLetters.grantSendMessages(pipeRole);

    this.pipe = new pipes.CfnPipe(this, 'Pipe', {
      name: `${props.prefix}-table-stream`,
      description: 'Each table stream record, unchanged, onto the application bus (ADR-MASTER §3, I6).',
      roleArn: pipeRole.roleArn,
      source: table.tableStreamArn,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: 'LATEST',
          batchSize: 10,
          maximumRetryAttempts: 10,
          deadLetterConfig: { arn: this.pipeDeadLetters.queueArn },
        },
        filterCriteria: { filters: [{ pattern: JSON.stringify(PIPE_FILTER) }] },
      },
      target: this.bus.eventBusArn,
      targetParameters: { eventBridgeEventBusParameters: { source: PIPE_SOURCE, detailType: PIPE_DETAIL_TYPE } },
    });
    this.pipe.node.addDependency(pipeRole);

    // ---------------------------------------------------------------------------------------------- the consumers
    const code = backendCode(this, 'consumers');
    for (const spec of CONSUMERS) {
      const deadLetters = deadLetterQueue(this, `${spec.handler}DeadLetters`, props.removalPolicy);
      const fn = backendFunction(this, {
        prefix: props.prefix, name: spec.name, handler: spec.handler, description: spec.event, code,
        table, dynamo: spec.dynamo(table.tableArn), accessLog: props.accessLog,
        coachSiteUrl: props.coachSiteUrl, familySiteUrl: props.familySiteUrl,
        templates: spec.templates, ...(props.email ? { email: props.email } : {}),
        timeout: spec.timeout ?? Duration.minutes(1),
        // Two retries, then the event goes to its queue (ADR-MASTER §19).
        deadLetters, removalPolicy: props.removalPolicy,
      });
      new events.Rule(this, `${spec.event}Rule`, {
        ruleName: `${props.prefix}-${spec.event}`,
        description: `${spec.event}: ${spec.name} (ADR-MASTER §3, I6)`,
        eventBus: this.bus,
        eventPattern: {
          source: [PIPE_SOURCE],
          detailType: [PIPE_DETAIL_TYPE],
          detail: EVENT_PATTERNS[spec.event],
        },
        targets: [new targets.LambdaFunction(fn, { deadLetterQueue: deadLetters, retryAttempts: 4, maxEventAge: Duration.hours(6) })],
      });
      this.functions.set(spec.name, fn);
      this.deadLetters.set(spec.name, deadLetters);

    }
    // ------------------------------------------------------------------------------------- the TTL archiver
    // The stream's second reader (ADR-MASTER §3): TTL removals only, each old image to the archive bucket (§20). No
    // dead-letter queue: Lambda retries a batch until it succeeds or the record leaves the stream; the stream-age alarm
    // (piece 7) catches a stuck one, and point-in-time recovery holds the items meanwhile (§19).
    this.ttlArchiver = backendFunction(this, {
      prefix: props.prefix, name: 'consumer-ttl-archiver', handler: 'TtlArchiver', description: 'TTL removals, to the archive',
      code, table, dynamo: [], coachSiteUrl: props.coachSiteUrl, familySiteUrl: props.familySiteUrl, templates: [],
      timeout: Duration.minutes(1), removalPolicy: props.removalPolicy,
      environment: { BLADEBOOK_ARCHIVEBUCKET: props.archive.bucketName },
    });
    this.ttlArchiver.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:PutObjectTagging'],
      resources: [props.archive.arnForObjects('*')],
    }));
    this.ttlArchiver.addEventSource(new DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 100,
      bisectBatchOnError: true,
      filters: [lambda.FilterCriteria.filter(TTL_FILTER)],
    }));
    Validations.of(this.ttlArchiver.role!).acknowledge(
      { id: 'AwsSolutions-IAM5[Resource::*]', reason: 'dynamodb:ListStreams has no resource-level permission; the stream reads are on this table\'s stream only.' },
      { id: 'AwsSolutions-IAM5[Resource::<DataArchive774FA568.Arn>/*]', reason: 'One object per expired item, at a key made from the item (ADR-MASTER §20): put and tag only, in the archive bucket.' },
    );

    Validations.of(pipeRole).acknowledge({
      id: 'AwsSolutions-IAM5[Resource::*]',
      reason: 'dynamodb:ListStreams has no resource-level permission; the stream reads are on this table\'s stream only.',
    });
  }
}
