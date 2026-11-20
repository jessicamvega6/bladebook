// One function from the consumers package (`consumers-lambda.zip`): an event consumer or a scheduled job (ADR-MASTER §2).
// Each has its own role, which writes only its own log group (no AWSLambdaBasicExecutionRole) and its own streams in
// the access-log group, its DynamoDB statements, and SES for its own templates only.

import { Duration, Validations } from 'aws-cdk-lib';
import type { RemovalPolicy } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import type { Email } from './email.ts';

export interface BackendFunctionProps {
  readonly prefix: string;
  /** Without the environment prefix: `consumer-…` or `sched-…`. */
  readonly name: string;
  /** The handler class in `com.bladebook.consumers.handler`; also the constructs' IDs. */
  readonly handler: string;
  readonly description: string;
  readonly code: lambda.Code;
  readonly table: dynamodb.ITable;
  readonly dynamo: iam.PolicyStatement[];
  /** The personal-data access log it writes its lines to; none for a function that reads no one's data for anyone. */
  readonly accessLog?: logs.ILogGroup;
  readonly coachSiteUrl: string;
  readonly familySiteUrl: string;
  /** The SES templates it may send (none: no SES and no sending address). */
  readonly templates: readonly string[];
  readonly email?: Email;
  readonly timeout: Duration;
  /** Where an invocation goes after Lambda's two retries; none: it's safe to run twice and alarmed on completion. */
  readonly deadLetters?: sqs.IQueue;
  readonly environment?: Record<string, string>;
  readonly removalPolicy: RemovalPolicy;
}

/** A dead-letter queue: encrypted, TLS only, kept 14 days (ADR-MASTER §19). */
export function deadLetterQueue(scope: Construct, id: string, removalPolicy: RemovalPolicy): sqs.Queue {
  const q = new sqs.Queue(scope, id, {
    encryption: sqs.QueueEncryption.SQS_MANAGED,
    enforceSSL: true,
    retentionPeriod: Duration.days(14),
    removalPolicy,
  });
  Validations.of(q).acknowledge({
    id: 'AwsSolutions-SQS3',
    reason: 'This is a dead-letter queue; it needs none of its own (ADR-MASTER §19).',
  });
  return q;
}

export function backendFunction(scope: Construct, p: BackendFunctionProps): lambda.Function {
  const name = `${p.prefix}-${p.name}`;
  const role = new iam.Role(scope, `${p.handler}Role`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    description: `${p.name}: ${p.description} (ADR-MASTER §2).`,
  });
  const logGroup = new logs.LogGroup(scope, `${p.handler}Logs`, {
    logGroupName: `/aws/lambda/${name}`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: p.removalPolicy,
  });
  // Its own log group only (not AWSLambdaBasicExecutionRole's every group).
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [logGroup.logGroupArn] }));
  for (const s of p.dynamo) role.addToPolicy(s);
  // Its own streams in the access-log group: no reading (ADR-MASTER §18; I12).
  if (p.accessLog) {
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [p.accessLog.logGroupArn],
    }));
  }
  const sends = p.email !== undefined && p.templates.length > 0;
  if (sends) p.email!.sendOnly(role, [...p.templates]);

  const fn = new lambda.Function(scope, p.handler, {
    functionName: name,
    description: `${p.description} (ADR-MASTER §2)`,
    runtime: lambda.Runtime.JAVA_17_AL2023,
    architecture: lambda.Architecture.ARM_64,
    handler: `com.bladebook.consumers.handler.${p.handler}::handleRequest`,
    code: p.code,
    role,
    memorySize: 1024,
    timeout: p.timeout,
    logGroup,
    retryAttempts: 2,
    ...(p.deadLetters ? { deadLetterQueue: p.deadLetters } : {}),
    environment: {
      BLADEBOOK_TABLE: p.table.tableName,
      BLADEBOOK_COACHSITEURL: p.coachSiteUrl.replace(/\/$/, ''),
      BLADEBOOK_FAMILYSITEURL: p.familySiteUrl.replace(/\/$/, ''),
      ...(p.accessLog ? { BLADEBOOK_ACCESSLOGGROUP: p.accessLog.logGroupName } : {}),
      ...(sends ? { BLADEBOOK_MAIL_FROM: p.email!.from, BLADEBOOK_MAIL_NOREPLY: p.email!.noReply } : {}),
      JAVA_TOOL_OPTIONS: '-XX:+TieredCompilation -XX:TieredStopAtLevel=1',
      ...p.environment,
    },
  });
  Validations.of(fn).acknowledge({
    id: 'AwsSolutions-L1',
    reason: 'java17.al2023 is the owner\'s choice (ADR-001 A10): Java 17, not the newest Java runtime.',
  });
  return fn;
}
