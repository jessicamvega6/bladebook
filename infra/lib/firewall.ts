// The Web Application Firewall (ADR-019, ADR-MASTER §17): one web ACL on the user pool now and
// on the REST API's stage once the API exists (Batch 17b). Not on CloudFront.

import { ArnFormat, Stack } from 'aws-cdk-lib';
import type { RemovalPolicy } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface FirewallProps {
  readonly name: string;
  readonly mode: 'count' | 'block';
  readonly removalPolicy: RemovalPolicy;
}

/** Per address, per 5 minutes (ADR-MASTER §17). */
export const RATE_LIMITS = {
  all: 1000,
  publicLookups: 20,
  cognitoAuth: 10,
} as const;

/** The routes that need no sign-in and look things up: one counter across all of them (ADR-019, 2026-10-20). */
const PUBLIC_LOOKUP_PREFIXES = ['/api/client/registration', '/api/client/coach-codes/', '/api/client/share-check'];

/** Cognito's sign-up and sign-in calls, by their X-Amz-Target operation. */
const COGNITO_AUTH_OPERATIONS = [
  'AWSCognitoIdentityProviderService.SignUp',
  'AWSCognitoIdentityProviderService.InitiateAuth',
  'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
];

function uriStartsWith(prefix: string): wafv2.CfnWebACL.StatementProperty {
  return {
    byteMatchStatement: {
      fieldToMatch: { uriPath: {} },
      positionalConstraint: 'STARTS_WITH',
      searchString: prefix,
      textTransformations: [{ priority: 0, type: 'NONE' }],
    },
  };
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
    const rate = (
      priority: number,
      name: string,
      limit: number,
      scopeDownStatement?: wafv2.CfnWebACL.StatementProperty,
    ): wafv2.CfnWebACL.RuleProperty => ({
      name,
      priority,
      action: ruleAction,
      statement: {
        rateBasedStatement: {
          limit,
          aggregateKeyType: 'IP',
          evaluationWindowSec: 300,
          ...(scopeDownStatement ? { scopeDownStatement } : {}),
        },
      },
      visibilityConfig: visibility(name),
    });

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: props.name,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('acl'),
      rules: [
        managed(0, 'AWSManagedRulesAmazonIpReputationList'),
        rate(1, 'rate-all', RATE_LIMITS.all),
        rate(2, 'rate-public-lookups', RATE_LIMITS.publicLookups, {
          orStatement: { statements: PUBLIC_LOOKUP_PREFIXES.map(uriStartsWith) },
        }),
        rate(3, 'rate-cognito-auth', RATE_LIMITS.cognitoAuth, {
          orStatement: { statements: COGNITO_AUTH_OPERATIONS.map(targetIs) },
        }),
        managed(4, 'AWSManagedRulesCommonRuleSet'),
        managed(5, 'AWSManagedRulesKnownBadInputsRuleSet'),
        // The /health rule waits for its limit (ADR-MASTER §21, open).
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
