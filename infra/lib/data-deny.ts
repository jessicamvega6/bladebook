// What no deploy may read (ADR-032, amended 2026-11-17, I13): the table's items, the access-log group and the
// objects in the data buckets. The same statements go two places:
//   - CDK's bootstrap execution policy, beside AdministratorAccess (infra/bootstrap/bootstrap.ts);
//   - GitHub's deploy role, as a second layer (deploy-access-stack.ts).
// An explicit deny wins over any allow. Dev's seed bucket isn't here: the table import reads it through
// CloudFormation, and it holds only fake data. The website buckets aren't here: they hold the public build.

import { resourcePrefix } from './config.ts';
import type { EnvConfig } from './config.ts';

export interface DenyStatement {
  readonly Sid: string;
  readonly Effect: 'Deny';
  readonly Action: string[];
  readonly Resource: string[];
}

/** Reading or exporting items: every table in the account, so a restored copy is covered too. */
export const TABLE_READS = [
  'dynamodb:GetItem',
  'dynamodb:BatchGetItem',
  'dynamodb:Query',
  'dynamodb:Scan',
  'dynamodb:PartiQLSelect',
  'dynamodb:ExportTableToPointInTime',
  'dynamodb:GetRecords',
  'dynamodb:GetShardIterator',
];

export const LOG_READS = [
  'logs:GetLogEvents',
  'logs:FilterLogEvents',
  'logs:StartQuery',
  'logs:StartLiveTail',
  'logs:CreateExportTask',
  'logs:GetLogRecord',
  'logs:Unmask',
];

export const OBJECT_READS = ['s3:GetObject', 's3:GetObjectVersion'];

/**
 * The data buckets' construct IDs under the app stack's `Data` (data-buckets.ts). Their names are generated as
 * `<stack>-<logical ID>-<random>`, lowercased, so each is matched by that start.
 */
export const DATA_BUCKETS = ['Archive', 'Reports', 'AccessLogArchive'] as const;

export function dataBucketPattern(cfg: EnvConfig, bucket: (typeof DATA_BUCKETS)[number]): string {
  return `${resourcePrefix(cfg)}-app-data${bucket.toLowerCase()}`;
}

export function dataDenyStatements(cfg: EnvConfig): DenyStatement[] {
  const { account, region } = cfg;
  const accessLog = `arn:aws:logs:${region}:${account}:log-group:/${resourcePrefix(cfg)}/access-log`;
  return [
    {
      Sid: 'NoTableItems',
      Effect: 'Deny',
      Action: TABLE_READS,
      Resource: [`arn:aws:dynamodb:*:${account}:table/*`],
    },
    {
      Sid: 'NoAccessLog',
      Effect: 'Deny',
      Action: LOG_READS,
      Resource: [accessLog, `${accessLog}:*`],
    },
    {
      Sid: 'NoDataObjects',
      Effect: 'Deny',
      Action: OBJECT_READS,
      Resource: DATA_BUCKETS.map((b) => `arn:aws:s3:::${dataBucketPattern(cfg, b)}*/*`),
    },
  ];
}

/** The bootstrap execution policy's deny, as a policy document. */
export function dataDenyPolicy(cfg: EnvConfig): { Version: '2012-10-17'; Statement: DenyStatement[] } {
  return { Version: '2012-10-17', Statement: dataDenyStatements(cfg) };
}

/** Its name in each account: created by infra/bootstrap/bootstrap.ts, handed to `cdk bootstrap`. */
export function dataDenyPolicyName(cfg: EnvConfig): string {
  return `${resourcePrefix(cfg)}-cdk-deny-data`;
}
