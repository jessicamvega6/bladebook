// The API (ADR-MASTER §1, §2, §17): `api-coach` and `api-client` on Lambda behind one API Gateway REST API, reached only
// through CloudFront under `/api/*` on each site's host (ADR-027, 2026-11-16; ADR-019, I1).
//
// - Every route that needs a signed-in person has API Gateway's built-in Cognito authorizer; Spring checks the token
//   again (audience, group, sign-in age), so the authorizer is the first of two gates.
// - CloudFront adds a secret header (`x-bladebook-origin`) to every request it sends here; both functions refuse a
//   request without it (OriginCheck in each API), and so does the firewall's rule (Batch 17b, piece 10).
// - The functions' execution roles hold no DynamoDB actions (tenant-roles.ts).

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { TenantRoles } from './tenant-roles.ts';

const backend = join(dirname(fileURLToPath(import.meta.url)), '../../backend');

/** The header CloudFront adds with the origin secret. The APIs' OriginCheck reads the same name. */
export const ORIGIN_HEADER = 'x-bladebook-origin';
/** The stage CloudFront's `/api/*` behaviour sends to (the origin path). */
export const STAGE = 'live';

/**
 * The Lambda package Maven builds (backend/lambda-zip.xml). `cdk.json`'s app command runs Maven first, so a deploy can't
 * ship a stale one (ADR-001 decision 2). The tests set the `bladebook:placeholderCode` context and use a stand-in.
 */
export function apiCode(scope: Construct, module: 'api-coach' | 'api-client'): lambda.Code {
  if (scope.node.tryGetContext('bladebook:placeholderCode')) {
    return lambda.Code.fromAsset(join(dirname(fileURLToPath(import.meta.url)), '../test/placeholder-code'));
  }
  const zip = join(backend, module, 'target', `${module}-lambda.zip`);
  if (!existsSync(zip)) throw new Error(`${zip} is missing: build the backend first (cd backend && ./mvnw -DskipTests package)`);
  return lambda.Code.fromAsset(zip);
}

export interface ApiProps {
  readonly prefix: string;
  readonly table: dynamodb.ITable;
  readonly tenants: TenantRoles;
  readonly userPool: cognito.IUserPool;
  readonly issuer: string;
  readonly coachAppClientId: string;
  readonly familyAppClientId: string;
  readonly coachSiteUrl: string;
  readonly familySiteUrl: string;
  /** The sending addresses for `api-coach`'s one email; unset until the environment has an email domain. */
  readonly mail?: { readonly from: string; readonly noReply: string };
  readonly removalPolicy: RemovalPolicy;
}

export class Api extends Construct {
  readonly restApi: apigw.RestApi;
  readonly apiCoach: lambda.Function;
  readonly apiClient: lambda.Function;
  /** CloudFront's origin header value. Rotate by changing it and redeploying (CloudFront and the APIs read it). */
  readonly originSecret: secrets.Secret;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);
    this.originSecret = new secrets.Secret(this, 'OriginSecret', {
      description: 'The header CloudFront adds to API requests; the API refuses any request without it (ADR-019, I1).',
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const common = {
      table: props.table.tableName,
      issuer: props.issuer,
      coachSite: props.coachSiteUrl.replace(/\/$/, ''),
      familySite: props.familySiteUrl.replace(/\/$/, ''),
    };
    const fn = (name: 'api-coach' | 'api-client', role: typeof props.tenants.apiCoachRole, env: Record<string, string>) => {
      const logGroup = new logs.LogGroup(this, `${name}-logs`, {
        logGroupName: `/aws/lambda/${props.prefix}-${name}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: props.removalPolicy,
      });
      const f = new lambda.Function(this, name, {
        functionName: `${props.prefix}-${name}`,
        runtime: lambda.Runtime.JAVA_17_AL2023,
        architecture: lambda.Architecture.ARM_64,
        handler: `com.bladebook.api.${name === 'api-coach' ? 'coach' : 'client'}.StreamLambdaHandler::handleRequest`,
        code: apiCode(this, name),
        role,
        // Spring Boot starts in a few seconds at this size; memory also buys CPU. API Gateway gives up at 29 seconds.
        memorySize: 1536,
        timeout: Duration.seconds(29),
        logGroup,
        environment: {
          BLADEBOOK_TABLE: common.table,
          BLADEBOOK_AUTH_ISSUER: common.issuer,
          BLADEBOOK_COACHSITEURL: common.coachSite,
          BLADEBOOK_FAMILYSITEURL: common.familySite,
          BLADEBOOK_ORIGINSECRETARN: this.originSecret.secretArn,
          // Faster cold starts: stop at the first JIT tier (a common setting for short Lambda requests).
          JAVA_TOOL_OPTIONS: '-XX:+TieredCompilation -XX:TieredStopAtLevel=1',
          ...env,
        },
      });
      // GetSecretValue only (ADR-MASTER §2): not grantRead, which adds DescribeSecret.
      role.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [this.originSecret.secretArn],
      }));
      return f;
    };
    this.apiCoach = fn('api-coach', props.tenants.apiCoachRole, {
      BLADEBOOK_AUTH_COACHAPPCLIENTID: props.coachAppClientId,
      ...(props.mail ? { BLADEBOOK_MAIL_FROM: props.mail.from, BLADEBOOK_MAIL_NOREPLY: props.mail.noReply } : {}),
      BLADEBOOK_ROLES_COACHTENANT: props.tenants.coachTenant.roleArn,
    });
    this.apiClient = fn('api-client', props.tenants.apiClientRole, {
      BLADEBOOK_AUTH_CLIENTAPPCLIENTID: props.familyAppClientId,
      BLADEBOOK_ROLES_CLIENTTENANT: props.tenants.clientTenant.roleArn,
      BLADEBOOK_ROLES_CODELOOKUP: props.tenants.codeLookup.roleArn,
    });

    // ------------------------------------------------------------------------------------------------- REST API
    const accessLogs = new logs.LogGroup(this, 'AccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.removalPolicy,
    });
    this.restApi = new apigw.RestApi(this, 'RestApi', {
      restApiName: `${props.prefix}-api`,
      description: 'BladeBook API; reached only through CloudFront under /api/* (ADR-019, I1).',
      endpointTypes: [apigw.EndpointType.REGIONAL],
      // Same host as the sites through CloudFront: no CORS (ADR-027, 2026-11-16).
      deployOptions: {
        stageName: STAGE,
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogs),
        accessLogFormat: apigw.AccessLogFormat.custom(JSON.stringify({
          requestId: '$context.requestId',
          time: '$context.requestTime',
          method: '$context.httpMethod',
          path: '$context.resourcePath',
          status: '$context.status',
          latencyMs: '$context.responseLatency',
        })),
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
        metricsEnabled: true,
      },
      // API Gateway writes logs through one role set on the account; it outlives the stack (retained), since a rebuilt
      // dev stack needs it again and it holds no data.
      cloudWatchRole: true,
      cloudWatchRoleRemovalPolicy: RemovalPolicy.RETAIN,
    });
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
      // Spring checks the audience, the group and the sign-in age again (ADR-MASTER §15).
      resultsCacheTtl: Duration.minutes(5),
    });
    const signedIn: apigw.MethodOptions = { authorizer, authorizationType: apigw.AuthorizationType.COGNITO };
    const open: apigw.MethodOptions = { authorizationType: apigw.AuthorizationType.NONE };

    const root = this.restApi.root.addResource('api');
    const route = (fnc: lambda.Function, base: string, publicGets: string[]) => {
      const integration = new apigw.LambdaIntegration(fnc, { proxy: true });
      const r = root.addResource(base);
      r.addResource('{proxy+}').addMethod('ANY', integration, signedIn);
      for (const path of publicGets) {
        let res: apigw.IResource = r;
        for (const part of path.split('/')) res = res.getResource(part) ?? res.addResource(part);
        res.addMethod('GET', integration, open);
      }
    };
    route(this.apiCoach, 'coach', ['health']);
    // The coach-code lookup is the one public data route (before sign-in; code-lookup role; rate-limited, ADR-019).
    route(this.apiClient, 'client', ['health', 'coach-codes/{code}']);

    Validations.of(this.restApi).acknowledge(
      { id: 'AwsSolutions-APIG2', reason: 'Requests are validated by the Spring controllers (one place for the rules, tested locally).' },
      { id: 'AwsSolutions-APIG3', reason: 'The firewall is attached to this stage by the Firewall construct when enabled (ADR-019); off in dev.' },
      { id: 'AwsSolutions-APIG6', reason: 'Execution logging needs an account-wide CloudWatch role; access logs and the functions\' own logs cover it.' },
      { id: 'AwsSolutions-APIG4', reason: 'Only health checks and the rate-limited coach-code lookup are public (ADR-019, ADR-022 d7).' },
      { id: 'AwsSolutions-COG4', reason: 'Only health checks and the rate-limited coach-code lookup have no Cognito authorizer.' },
    );
    Validations.of(this.restApi).acknowledge({
      id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs]',
      reason: 'API Gateway\'s account-wide logging role: AWS\'s managed policy only lets it write CloudWatch logs.',
    });
    Validations.of(this.originSecret).acknowledge({
      id: 'AwsSolutions-SMG4',
      reason: 'CloudFront\'s origin header can\'t be rotated by a rotation function; rotate by redeploying (ADR-019).',
    });
    for (const f of [this.apiCoach, this.apiClient]) {
      Validations.of(f).acknowledge({
        id: 'AwsSolutions-L1',
        reason: 'java17.al2023 is the owner\'s choice (ADR-001 A10): Java 17, not the newest Java runtime.',
      });
    }
  }
}
