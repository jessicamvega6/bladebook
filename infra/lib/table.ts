// The one table (ADR-MASTER §3): single-table design, four indexes, the stream the Pipe and the
// TTL archiver read, and `expiresAt` as the TTL attribute (§20). In dev it is created by one import
// from the seed bucket (ADR-028 d1); nothing is loaded into it afterwards.

import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/** Where the seed script writes the import file: one fixed prefix, overwritten by each seed (ADR-028). */
export const SEED_PREFIX = 'seed/current/';

export const INDEXES = ['GSI1', 'GSI2', 'GSI3', 'GSI4'] as const;

export interface BladebookTableProps {
  readonly tableName: string;
  readonly removalPolicy: RemovalPolicy;
  /** Dev: the account stack's seed bucket. The table is created from `SEED_PREFIX` in it. */
  readonly seedBucket?: s3.IBucket;
}

export class BladebookTable extends Construct {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: BladebookTableProps) {
    super(scope, id);
    const retain = props.removalPolicy === RemovalPolicy.RETAIN;
    const key = (name: string): dynamodb.Attribute => ({ name, type: dynamodb.AttributeType.STRING });

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: key('PK'),
      sortKey: key('SK'),
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Two readers: the EventBridge Pipe and consumer-ttl-archiver (§3).
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'expiresAt',
      // §20: 35 days of point-in-time recovery. On in dev too: a seed table costs cents, and a
      // dev that rehearses a restore needs it.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: retain,
      removalPolicy: props.removalPolicy,
      // Encrypted with the AWS-owned key (architecture.md §7: no customer-managed keys).
      ...(props.seedBucket
        ? {
            importSource: {
              bucket: props.seedBucket,
              keyPrefix: SEED_PREFIX,
              inputFormat: dynamodb.InputFormat.dynamoDBJson(),
              compressionType: dynamodb.InputCompressionType.GZIP,
            },
          }
        : {}),
    });

    // Every index projects ALL (ADR-MASTER §3, I20).
    for (const name of INDEXES) {
      this.table.addGlobalSecondaryIndex({
        indexName: name,
        partitionKey: key(`${name}PK`),
        sortKey: key(`${name}SK`),
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }
  }
}
