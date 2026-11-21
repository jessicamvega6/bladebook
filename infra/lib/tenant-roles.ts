// The database gate (ADR-MASTER §16; ADR-021, ADR-022, ADR-024, ADR-033). Neither API function's own role can touch the
// table: per request, `api-coach` assumes `coach-tenant` tagged with the coach's `sub`, and `api-client` assumes
// `client-tenant` tagged with the family's `sub` (and, for its second session, the coach and its standing with them), or
// `code-lookup` before sign-in. Each policy limits the session to its own partition by `dynamodb:LeadingKeys`.
//
// The database gate tests (docs/runbooks/database-gate-tests.sh) run against these very roles in dev (I11), through
// `<prefix>-gate-test`, which only dev's tenant roles trust. Change a statement here, then re-run them (ADR-022 d9).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, Validations } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * The read allowlists, from the one copy both sides use: core's `client-read-allowlist.json`, which core.data's local mode
 * also enforces (ADR-022 d3, d6, d7; written 2026-11-17, I2). They fail closed.
 */
const allowlist = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../backend/core/src/main/resources/bladebook/client-read-allowlist.json'), 'utf8',
)) as { coachPublic: string[]; coachCode: string[]; skaterCode: string[] };

/** What a family may read in an `ACTIVE` coach's partition (ADR-022 decision 6). */
export const COACH_PUBLIC_ATTRIBUTES: readonly string[] = allowlist.coachPublic;

/** A `CODE#` item's fields: what the code screen shows (ADR-022 decision 7). */
export const CODE_ATTRIBUTES: readonly string[] = allowlist.coachCode;

/** A `SKATERCODE#` item's fields: the skater's ID and display name (ADR-MASTER §16, ADR-026). */
export const SKATER_CODE_ATTRIBUTES: readonly string[] = allowlist.skaterCode;

const ITEM_WRITES = ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:ConditionCheckItem'];

export interface TenantRolesProps {
  readonly table: dynamodb.ITable;
  /** Dev only (I11): the gate tests' role, which the tenant roles trust as they trust the APIs. */
  readonly gateTest?: { readonly prefix: string };
}

export class TenantRoles extends Construct {
  /** `api-coach`'s execution role: logs, and assuming `coach-tenant`. No DynamoDB actions. */
  readonly apiCoachRole: iam.Role;
  /** `api-client`'s execution role: logs, and assuming `client-tenant` and `code-lookup`. No DynamoDB actions. */
  readonly apiClientRole: iam.Role;
  readonly coachTenant: iam.Role;
  readonly clientTenant: iam.Role;
  readonly codeLookup: iam.Role;
  /** Dev only: `<prefix>-gate-test`, which the owner signs into to run the gate tests. */
  readonly gateTest?: iam.Role;

  constructor(scope: Construct, id: string, props: TenantRolesProps) {
    super(scope, id);
    const table = props.table.tableArn;
    const lambdaRole = (name: string, description: string): iam.Role =>
      new iam.Role(this, name, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description,
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      });
    this.apiCoachRole = lambdaRole('ApiCoachRole', 'api-coach: no DynamoDB actions; assumes coach-tenant per request.');
    this.apiClientRole = lambdaRole('ApiClientRole',
      'api-client: no DynamoDB actions; assumes client-tenant per request and code-lookup before sign-in.');
    // Dev only (I11): the owner signs into it (anyone in this account who may assume roles) and it can do nothing but
    // start tenant sessions, under the same tag rules as the APIs. No DynamoDB actions of its own (ADR-021 row 8).
    if (props.gateTest) {
      this.gateTest = new iam.Role(this, 'GateTestRole', {
        roleName: `${props.gateTest.prefix}-gate-test`,
        assumedBy: new iam.AccountRootPrincipal(),
        maxSessionDuration: Duration.hours(1),
        description: 'Dev only: runs the database gate tests against the real tenant roles (ADR-021 d7, ADR-022 d9, I11).',
      });
    }
    const gate = this.gateTest ? [this.gateTest] : [];

    // ------------------------------------------------------------------------------------------------- coach-tenant
    this.coachTenant = this.tenantRole('CoachTenant', 'coach-tenant: one coach\'s partition, tagged coachId.',
      trust([this.apiCoachRole, ...gate], ['coachId'], 'coachId'), [
        new iam.PolicyStatement({
          sid: 'OwnPartitionOnly',
          actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query', ...ITEM_WRITES],
          resources: [table, `${table}/index/GSI3`],
          conditions: { 'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': ['COACH#${aws:PrincipalTag/coachId}'] } },
        }),
        new iam.PolicyStatement({
          sid: 'CoachCodeWrite',
          actions: ITEM_WRITES,
          resources: [table],
          conditions: {
            'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['CODE#*'], 'dynamodb:Attributes': [...CODE_ATTRIBUTES] },
            StringEqualsIfExists: { 'dynamodb:ReturnValues': 'NONE' },
          },
        }),
      ]);

    // ------------------------------------------------------------------------------------------------ client-tenant
    const codeRead = (sid: string, prefix: string, attributes: readonly string[]): iam.PolicyStatement =>
      new iam.PolicyStatement({
        sid,
        actions: ['dynamodb:GetItem'],
        resources: [table],
        conditions: {
          'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': [`${prefix}*`] },
          'ForAllValues:StringEquals': { 'dynamodb:Attributes': [...attributes] },
          StringEquals: { 'dynamodb:Select': 'SPECIFIC_ATTRIBUTES' },
        },
      });
    const ownClient = { 'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': ['CLIENT#${aws:PrincipalTag/clientId}'] } };
    const linkedCoach = { 'dynamodb:LeadingKeys': ['COACH#${aws:PrincipalTag/coachId}'] };
    this.clientTenant = this.tenantRole('ClientTenant',
      'client-tenant: one family\'s partition, and reads of its ACTIVE coach\'s public fields.',
      trust([this.apiClientRole, ...gate], ['clientId', 'coachId', 'linkStatus'], 'clientId'), [
        new iam.PolicyStatement({
          sid: 'OwnClientPartition',
          actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query', ...ITEM_WRITES],
          resources: [table],
          conditions: ownClient,
        }),
        new iam.PolicyStatement({
          sid: 'OwnClientIndex', actions: ['dynamodb:Query'], resources: [`${table}/index/GSI1`], conditions: ownClient,
        }),
        new iam.PolicyStatement({
          sid: 'CoachPartitionPublicRead',
          actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query'],
          resources: [table],
          conditions: {
            'ForAllValues:StringEquals': { ...linkedCoach, 'dynamodb:Attributes': [...COACH_PUBLIC_ATTRIBUTES] },
            StringEquals: { 'dynamodb:Select': 'SPECIFIC_ATTRIBUTES', 'aws:PrincipalTag/linkStatus': 'ACTIVE' },
          },
        }),
        new iam.PolicyStatement({
          sid: 'CoachPartitionWrite',
          actions: ITEM_WRITES,
          resources: [table],
          conditions: {
            'ForAllValues:StringEquals': linkedCoach,
            StringEqualsIfExists: { 'dynamodb:ReturnValues': 'NONE' },
          },
        }),
        codeRead('CoachCodeRead', 'CODE#', CODE_ATTRIBUTES),
        codeRead('SkaterCodeRead', 'SKATERCODE#', SKATER_CODE_ATTRIBUTES),
      ]);

    // -------------------------------------------------------------------------------------------------- code-lookup
    // Untagged: no identity exists before sign-in. Its trust gives no sts:TagSession, so no session can carry a tag.
    this.codeLookup = this.tenantRole('CodeLookup', 'code-lookup: before sign-in, a coach code\'s name fields only.', {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { AWS: [this.apiClientRole, ...gate].map((r) => r.roleArn) }, Action: 'sts:AssumeRole' }],
    }, [codeRead('CoachCodeRead', 'CODE#', CODE_ATTRIBUTES)]);

    // ----------------------------------------------------------------------------- the API roles may assume them
    this.apiCoachRole.addToPrincipalPolicy(assume([this.coachTenant]));
    this.apiClientRole.addToPrincipalPolicy(assume([this.clientTenant, this.codeLookup]));
    this.gateTest?.addToPrincipalPolicy(assume([this.coachTenant, this.clientTenant, this.codeLookup]));

    for (const role of [this.apiCoachRole, this.apiClientRole]) {
      Validations.of(role).acknowledge({
        id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
        reason: 'AWSLambdaBasicExecutionRole only lets the function write its own logs.',
      });
    }
  }

  private tenantRole(id: string, description: string, trustPolicy: object, statements: iam.PolicyStatement[]): iam.Role {
    const role = new iam.Role(this, id, {
      // Replaced below: CDK's principal helpers can't state "exactly these tag keys".
      assumedBy: new iam.AccountRootPrincipal(),
      description,
      inlinePolicies: { Gate: new iam.PolicyDocument({ statements }) },
    });
    (role.node.defaultChild as iam.CfnRole).assumeRolePolicyDocument = trustPolicy;
    return role;
  }
}

/**
 * Only `callers` (the API, and in dev the gate tests' role) may assume the role, for one hour, with tag keys from `keys` alone and `required` always present, and
 * with the person's `sub` as source identity (ADR-MASTER §16).
 */
function trust(callers: iam.IRole[], keys: string[], required: string): object {
  const principal = { AWS: callers.map((c) => c.roleArn) };
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: principal,
        Action: ['sts:AssumeRole', 'sts:TagSession'],
        Condition: {
          'ForAllValues:StringEquals': { 'aws:TagKeys': keys },
          Null: { [`aws:RequestTag/${required}`]: 'false' },
        },
      },
      // Its own statement: STS checks setting the source identity without the request's tags, so the tag conditions
      // above would refuse it (found deploying to dev, 2026-11-17).
      { Effect: 'Allow', Principal: principal, Action: 'sts:SetSourceIdentity' },
    ],
  };
}

function assume(roles: iam.IRole[]): iam.PolicyStatement {
  return new iam.PolicyStatement({
    actions: ['sts:AssumeRole', 'sts:TagSession', 'sts:SetSourceIdentity'],
    resources: roles.map((r) => r.roleArn),
  });
}
