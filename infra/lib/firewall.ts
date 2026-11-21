// The Web Application Firewall (ADR-019, ADR-MASTER §17): one web ACL on the user pool and on the REST API's stage.
// Not on CloudFront (I1).
//
// The two are told apart by the Host header: API Gateway's ends in `.execute-api.<region>.amazonaws.com`.
// - API requests reach the firewall from CloudFront's addresses, so their rate rules count by the visitor's address,
//   which CloudFront's function writes into `x-bladebook-viewer-ip` (overwriting anything the visitor sent). A request
//   without CloudFront's secret origin header is refused first, so nobody can reach the API around CloudFront.
// - Cognito's requests come straight from the visitor, so its rules count by the connecting address.

import { ArnFormat, Stack } from 'aws-cdk-lib';
import type { RemovalPolicy } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface FirewallProps {
  readonly name: string;
  readonly mode: 'count' | 'block';
  /** CloudFront's origin header value (ADR-019, I1): an API request without it is refused. */
  readonly originSecret: secrets.ISecret;
  readonly removalPolicy: RemovalPolicy;
}

/** Per address, per 5 minutes (ADR-MASTER §17). */
export const RATE_LIMITS = {
  all: 1000,
  publicLookups: 20,
  cognitoAuth: 10,
  /** ADR-MASTER §17 left it to be set when built: the up-check calls once a minute from three places. */
  health: 100,
} as const;

/** The header CloudFront writes the visitor's address into (website.ts); the API's rate rules count by it. */
const VIEWER_IP_HEADER = 'x-bladebook-viewer-ip';
/** The header CloudFront adds with the origin secret (api.ts). */
const ORIGIN_HEADER = 'x-bladebook-origin';

/**
 * The routes that need no sign-in and look things up: one counter across all of them (ADR-019, 2026-10-20). Matched
 * anywhere in the path, since the firewall may see API Gateway's stage in front of it.
 */
const PUBLIC_LOOKUP_PREFIXES = ['/api/client/registration', '/api/client/coach-codes/', '/api/client/share-check'];

/** Cognito's sign-up and sign-in calls, by their X-Amz-Target operation. */
const COGNITO_AUTH_OPERATIONS = [
  'AWSCognitoIdentityProviderService.SignUp',
  'AWSCognitoIdentityProviderService.InitiateAuth',
  'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
];

function uriContains(part: string): wafv2.CfnWebACL.StatementProperty {
  return {
    byteMatchStatement: {
      fieldToMatch: { uriPath: {} },
      positionalConstraint: 'CONTAINS',
      searchString: part,
      textTransformations: [{ priority: 0, type: 'NONE' }],
    },
  };
}

/** A request to the API (its Host is API Gateway's), rather than to Cognito. */
const IS_API: wafv2.CfnWebACL.StatementProperty = {
  byteMatchStatement: {
    fieldToMatch: { singleHeader: { Name: 'host' } },
    positionalConstraint: 'CONTAINS',
    searchString: '.execute-api.',
    textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
  },
};
const IS_COGNITO: wafv2.CfnWebACL.StatementProperty = { notStatement: { statement: IS_API } };

function and(...statements: wafv2.CfnWebACL.StatementProperty[]): wafv2.CfnWebACL.StatementProperty {
  return { andStatement: { statements } };
}

function targetIs(operation: string): wafv2.CfnWebACL.StatementProperty {
  return {
    byteMatchStatement: {
      fieldToMatch: { singleHeader: { Name: 'x-amz-target' } },
      positionalConstraint: 'EXACTLY',
      searchString: operation,
      textTransformations: [{ priority: 0, type: 'NONE' }],
    },
  };
}

export class Firewall extends Construct {
  readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: FirewallProps) {
    super(scope, id);
    const counting = props.mode === 'count';
    const ruleAction = counting ? { count: {} } : { block: {} };
    const groupOverride = counting ? { count: {} } : { none: {} };
    const visibility = (metricName: string) => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName: `${props.name}-${metricName}`,
    });
    const managed = (priority: number, name: string): wafv2.CfnWebACL.RuleProperty => ({
      name,
      priority,
      overrideAction: groupOverride,
      statement: { managedRuleGroupStatement: { vendorName: 'AWS', name } },
      visibilityConfig: visibility(name),
    });
    // `api`: counted by the visitor's address from CloudFront's header; otherwise by the connecting address (Cognito).
    const rate = (
      priority: number,
      name: string,
      limit: number,
      by: 'api' | 'cognito',
      scopeDownStatement: wafv2.CfnWebACL.StatementProperty,
    ): wafv2.CfnWebACL.RuleProperty => ({
      name,
      priority,
      action: ruleAction,
      statement: {
        rateBasedStatement: {
          limit,
          evaluationWindowSec: 300,
          ...(by === 'api'
            // No header means it didn't come through CloudFront, which the origin rule has already refused.
            ? { aggregateKeyType: 'FORWARDED_IP', forwardedIpConfig: { headerName: VIEWER_IP_HEADER, fallbackBehavior: 'NO_MATCH' } }
            : { aggregateKeyType: 'IP' }),
          scopeDownStatement,
        },
      },
      visibilityConfig: visibility(name),
    });
    // ADR-019 (I1): an API request without CloudFront's secret is refused. A CloudFormation dynamic reference, so the
    // value isn't in the template.
    const originCheck: wafv2.CfnWebACL.RuleProperty = {
      name: 'origin-header',
      priority: 0,
      action: ruleAction,
      statement: and(IS_API, {
        notStatement: {
          statement: {
            byteMatchStatement: {
              fieldToMatch: { singleHeader: { Name: ORIGIN_HEADER } },
              positionalConstraint: 'EXACTLY',
              searchString: props.originSecret.secretValue.unsafeUnwrap(),
              textTransformations: [{ priority: 0, type: 'NONE' }],
            },
          },
        },
      }),
      visibilityConfig: visibility('origin-header'),
    };

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: props.name,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('acl'),
      rules: [
        originCheck,
        // The IP reputation list protects Cognito only: API requests arrive from CloudFront's addresses (I1).
        { ...managed(1, 'AWSManagedRulesAmazonIpReputationList'),
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesAmazonIpReputationList', scopeDownStatement: IS_COGNITO } } },
        rate(2, 'rate-all-api', RATE_LIMITS.all, 'api', IS_API),
        rate(3, 'rate-all-cognito', RATE_LIMITS.all, 'cognito', IS_COGNITO),
        rate(4, 'rate-public-lookups', RATE_LIMITS.publicLookups, 'api',
          and(IS_API, { orStatement: { statements: PUBLIC_LOOKUP_PREFIXES.map(uriContains) } })),
        rate(5, 'rate-cognito-auth', RATE_LIMITS.cognitoAuth, 'cognito',
          and(IS_COGNITO, { orStatement: { statements: COGNITO_AUTH_OPERATIONS.map(targetIs) } })),
        rate(6, 'rate-health', RATE_LIMITS.health, 'api', and(IS_API, uriContains('/health'))),
        managed(7, 'AWSManagedRulesCommonRuleSet'),
        managed(8, 'AWSManagedRulesKnownBadInputsRuleSet'),
      ],
    });

    // ADR-019: matched requests only, Authorization redacted, 30 days.
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `aws-waf-logs-${props.name}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.removalPolicy,
    });
    new wafv2.CfnLoggingConfiguration(this, 'Logging', {
      resourceArn: this.webAcl.attrArn,
      // WAF wants the log group's ARN without CloudFormation's trailing ':*'.
      logDestinationConfigs: [
        Stack.of(this).formatArn({
          service: 'logs',
          resource: 'log-group',
          resourceName: logGroup.logGroupName,
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
      ],
      redactedFields: [{ singleHeader: { Name: 'authorization' } }],
      loggingFilter: {
        DefaultBehavior: 'DROP',
        Filters: [
          {
            Behavior: 'KEEP',
            Requirement: 'MEETS_ANY',
            Conditions: [{ ActionCondition: { Action: 'BLOCK' } }, { ActionCondition: { Action: 'COUNT' } }],
          },
        ],
      },
    });
  }

  associate(id: string, resourceArn: string): void {
    new wafv2.CfnWebACLAssociation(this, id, { resourceArn, webAclArn: this.webAcl.attrArn });
  }
}
