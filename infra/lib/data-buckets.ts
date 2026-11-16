// The buckets that hold data (not the website builds), and the personal-data access log with
// its archive. Nothing writes to them until the functions arrive (Batch 17b).

import { Duration, RemovalPolicy, Size, Stack, Validations } from 'aws-cdk-lib';
import type { CfnElement } from 'aws-cdk-lib';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DataBucketsProps {
  readonly prefix: string;
  readonly removalPolicy: RemovalPolicy;
}

export class DataBuckets extends Construct {
  readonly archive: s3.Bucket;
  readonly reports: s3.Bucket;
  readonly accessLogArchive: s3.Bucket;
  readonly accessLog: logs.LogGroup;

  constructor(scope: Construct, id: string, props: DataBucketsProps) {
    super(scope, id);
    const destroy = props.removalPolicy === RemovalPolicy.DESTROY;
    // SSE-KMS with the AWS-managed aws/s3 key, public access blocked, TLS only
    // (architecture.md §7: no customer-managed keys).
    const common = {
      encryption: s3.BucketEncryption.KMS_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: destroy,
    };

    // ADR-017: TTL-expired items, kept 30 days in ordinary storage, then Deep Archive. Items are
    // a kilobyte or two, so the rule must name a minimum size below S3's 128 KB default.
    // Versioning off. The expiry waits on the legal review (at least 210 days).
    this.archive = new s3.Bucket(this, 'Archive', {
      ...common,
      versioned: false,
      lifecycleRules: [
        {
          id: 'deep-archive-after-30-days',
          objectSizeGreaterThan: 0,
          transitions: [{ storageClass: s3.StorageClass.DEEP_ARCHIVE, transitionAfter: Duration.days(30) }],
        },
      ],
    });

    // architecture.md §7: the cancellation reports. Versioned; its lifecycle isn't decided.
    this.reports = new s3.Bucket(this, 'Reports', { ...common, versioned: true });

    // ADR-012 (2026-10-12): the access log's second tier. Large batched objects, Deep Archive,
    // deleted after 2 years, no Object Lock. The day it moves to Deep Archive isn't stated;
    // 30 days matches ADR-017's archive.
    this.accessLogArchive = new s3.Bucket(this, 'AccessLogArchive', {
      ...common,
      versioned: false,
      lifecycleRules: [
        {
          id: 'deep-archive-then-delete-after-2-years',
          objectSizeGreaterThan: 0,
          transitions: [{ storageClass: s3.StorageClass.DEEP_ARCHIVE, transitionAfter: Duration.days(30) }],
          expiration: Duration.days(730),
        },
      ],
    });

    // ADR-012: the personal-data access log, in its own group, searchable for 90 days.
    this.accessLog = new logs.LogGroup(this, 'AccessLog', {
      logGroupName: `/${props.prefix}/access-log`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: props.removalPolicy,
    });

    // ...and every line streamed through Firehose into the archive bucket in large objects.
    const stream = new firehose.DeliveryStream(this, 'AccessLogStream', {
      encryption: firehose.StreamEncryption.awsOwnedKey(),
      destination: new firehose.S3Bucket(this.accessLogArchive, {
        dataOutputPrefix: 'access-log/',
        errorOutputPrefix: 'access-log-errors/',
        bufferingInterval: Duration.minutes(15),
        bufferingSize: Size.mebibytes(128),
        // CloudWatch Logs already sends gzip; Firehose writes it as it comes.
        compression: firehose.Compression.UNCOMPRESSED,
        // Firehose's delivery errors, in a group that follows the environment's removal rule.
        loggingConfig: new firehose.EnableLogging(
          new logs.LogGroup(this, 'AccessLogStreamErrors', {
            retention: logs.RetentionDays.THREE_MONTHS,
            removalPolicy: props.removalPolicy,
          }),
        ),
      }),
    });
    // CDK's own write grant to the one archive bucket: object and multipart actions on its keys.
    const firehoseGrant = 'Firehose\'s standard S3 write grant, limited to the access-log archive bucket and its objects.';
    Validations.of(stream).acknowledge(
      ...['s3:GetObject*', 's3:GetBucket*', 's3:List*', 's3:DeleteObject*', 's3:Abort*'].map((action) => ({
        id: `AwsSolutions-IAM5[Action::${action}]`,
        reason: firehoseGrant,
      })),
      { id: `AwsSolutions-IAM5[Resource::<${Stack.of(this).getLogicalId(this.accessLogArchive.node.defaultChild as CfnElement)}.Arn>/*]`, reason: firehoseGrant },
    );

    new logs.SubscriptionFilter(this, 'AccessLogToArchive', {
      logGroup: this.accessLog,
      filterPattern: logs.FilterPattern.allEvents(),
      destination: new destinations.FirehoseDestination(stream),
    });

    for (const bucket of [this.archive, this.reports, this.accessLogArchive]) {
      Validations.of(bucket).acknowledge({
        id: 'AwsSolutions-S1',
        reason: 'Object-level CloudTrail data events are the record of reads and writes (ADR-012 d5). Dev\'s trail writes to production\'s data-loading stack (ADR-027 d4), so it is built with production.',
      });
    }
  }
}
