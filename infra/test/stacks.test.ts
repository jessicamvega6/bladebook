import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Match } from 'aws-cdk-lib/assertions';
import { testAccounts } from '../lib/test-accounts.ts';
import { spaRoutingCode } from '../lib/website.ts';
import { build, synthWithSecurityChecks, TEST_MAILBOX, testDev, testProd } from './helpers.ts';

const dev = build(testDev);
const prod = build(testProd);

describe('security checks', () => {
  test('cdk-nag finds nothing unacknowledged in dev or production, firewall on or off', () => {
    for (const cfgs of [[testDev, testProd], [{ ...testDev, waf: { enabled: true, mode: 'block' as const } }]]) {
      const err = synthWithSecurityChecks(cfgs);
      assert.equal(err, undefined, err?.message);
    }
    const withAccounts = synthWithSecurityChecks([testDev], { testMailbox: TEST_MAILBOX });
    assert.equal(withAccounts, undefined, withAccounts?.message);
  });
});

describe('data survives in production, not in dev (ADR-027 d4)', () => {
  test('production retains the user pool, with deletion protection', () => {
    prod.identity.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({ DeletionProtection: 'ACTIVE' }),
    });
  });
  test('production retains every bucket and log group', () => {
    for (const type of ['AWS::S3::Bucket', 'AWS::Logs::LogGroup']) {
      for (const [id, res] of Object.entries(prod.app.findResources(type))) {
        assert.equal(res.DeletionPolicy, 'Retain', `${id} must be retained`);
      }
    }
  });
  test('dev deletes the user pool, the buckets (emptied first) and the log groups', () => {
    dev.identity.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Delete',
      Properties: Match.objectLike({ DeletionProtection: 'INACTIVE' }),
    });
    for (const type of ['AWS::S3::Bucket', 'AWS::Logs::LogGroup']) {
      for (const [id, res] of Object.entries(dev.app.findResources(type))) {
        assert.equal(res.DeletionPolicy, 'Delete', `${id} must be deleted with dev`);
      }
    }
    dev.app.resourceCountIs('Custom::S3AutoDeleteObjects', 5);
  });
});

describe('Cognito (ADR-MASTER §2, ADR-023 d11)', () => {
  test('two groups: Coach and Client', () => {
    dev.identity.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'Coach' });
    dev.identity.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'Client' });
  });
  test('email is the username; MFA optional by authenticator app', () => {
    dev.identity.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
  });
  const clients = Object.values(dev.identity.findResources('AWS::Cognito::UserPoolClient'));
  test('each client: no secret, SRP and refresh only, no OAuth, no existence errors', () => {
    assert.equal(clients.length, 2);
    for (const c of clients) {
      const p = c.Properties;
      assert.equal(p.GenerateSecret, false);
      assert.deepEqual([...p.ExplicitAuthFlows].sort(), ['ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_SRP_AUTH']);
      assert.equal(p.AllowedOAuthFlowsUserPoolClient, false);
      assert.equal(p.PreventUserExistenceErrors, 'ENABLED');
    }
  });
  test('refresh tokens: 4 hours for coaches, 60 minutes for families', () => {
    const byName: Record<string, any> = Object.fromEntries(clients.map((c) => [c.Properties.ClientName, c.Properties]));
    assert.equal(byName['coach-web'].RefreshTokenValidity, 240);
    assert.equal(byName['family-web'].RefreshTokenValidity, 60);
    for (const p of Object.values(byName)) assert.equal(p.TokenValidityUnits.RefreshToken, 'minutes');
  });
});

describe('websites', () => {
  test('two distributions, one per host, TLS 1.2 or later', () => {
    dev.app.resourceCountIs('AWS::CloudFront::Distribution', 2);
    for (const host of ['app.dev.bladebook.org', 'family.dev.bladebook.org']) {
      dev.app.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Aliases: [host],
          ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: 'TLSv1.2_2021' }),
        }),
      });
    }
  });
  test('buckets are private and read only through origin access control', () => {
    dev.app.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
    for (const res of Object.values(dev.app.findResources('AWS::S3::Bucket'))) {
      assert.deepEqual(res.Properties.PublicAccessBlockConfiguration, {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });
  const robotsHeaders = (t: typeof dev.app) =>
    Object.values(t.findResources('AWS::CloudFront::ResponseHeadersPolicy')).flatMap((r) =>
      r.Properties.ResponseHeadersPolicyConfig.CustomHeadersConfig.Items.filter((h: { Header: string }) => h.Header === 'X-Robots-Tag'),
    );
  test('dev asks search engines not to index; production does not', () => {
    assert.equal(robotsHeaders(dev.app).length, 2);
    assert.equal(robotsHeaders(prod.app).length, 0);
  });
});

describe('page routing (CloudFront Function)', () => {
  // Run the function's own code against sample paths.
  const route = (roots: string[], uri: string): string => {
    const handler = new Function(`${spaRoutingCode(roots)}; return handler;`)();
    return handler({ request: { uri } }).uri;
  };
  const coach = ['/rinkside/', '/'];
  test('pages get their app\'s index.html', () => {
    assert.equal(route(coach, '/'), '/index.html');
    assert.equal(route(coach, '/schedule/week'), '/index.html');
    assert.equal(route(coach, '/rinkside'), '/rinkside/index.html');
    assert.equal(route(coach, '/rinkside/today'), '/rinkside/index.html');
  });
  test('files are served as they are', () => {
    assert.equal(route(coach, '/assets/app-1a2b.js'), '/assets/app-1a2b.js');
    assert.equal(route(coach, '/rinkside/sw.js'), '/rinkside/sw.js');
  });
  test('a dot in a folder name doesn\'t make a page a file', () => {
    assert.equal(route(coach, '/v1.2/page'), '/index.html');
  });
  test('roots must start and end with a slash', () => {
    assert.throws(() => spaRoutingCode(['/rinkside']));
  });
});

describe('firewall (ADR-019)', () => {
  test('off in dev by default: no web ACL', () => {
    dev.app.resourceCountIs('AWS::WAFv2::WebACL', 0);
  });
  const prodAcl = Object.values(prod.app.findResources('AWS::WAFv2::WebACL'))[0]?.Properties;
  test('production: three managed groups and three rate rules, counting at first', () => {
    const rules = prodAcl.Rules as Array<Record<string, any>>;
    assert.equal(rules.length, 6);
    const limits = Object.fromEntries(
      rules.filter((r) => r.Statement.RateBasedStatement).map((r) => [r.Name, r.Statement.RateBasedStatement.Limit]),
    );
    assert.deepEqual(limits, { 'rate-all': 1000, 'rate-public-lookups': 20, 'rate-cognito-auth': 10 });
    for (const r of rules) {
      if (r.Statement.ManagedRuleGroupStatement) assert.deepEqual(r.OverrideAction, { Count: {} });
      else assert.deepEqual(r.Action, { Count: {} });
    }
  });
  test('block mode blocks', () => {
    const blocking = build({ ...testDev, waf: { enabled: true, mode: 'block' } });
    const rules = Object.values(blocking.app.findResources('AWS::WAFv2::WebACL'))[0].Properties.Rules as Array<Record<string, any>>;
    for (const r of rules) {
      if (r.Statement.ManagedRuleGroupStatement) assert.deepEqual(r.OverrideAction, { None: {} });
      else assert.deepEqual(r.Action, { Block: {} });
    }
  });
  test('attached to the user pool; logs only matched requests, Authorization redacted', () => {
    prod.app.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    prod.app.hasResourceProperties('AWS::WAFv2::LoggingConfiguration', {
      RedactedFields: [{ SingleHeader: { Name: 'authorization' } }],
      LoggingFilter: Match.objectLike({ DefaultBehavior: 'DROP' }),
    });
    prod.app.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: 'aws-waf-logs-bladebook-prod',
      RetentionInDays: 30,
    });
  });
});

describe('access log (ADR-012)', () => {
  test('90 days searchable, every line streamed to the archive', () => {
    dev.app.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/bladebook-dev/access-log', RetentionInDays: 90 });
    dev.app.resourceCountIs('AWS::Logs::SubscriptionFilter', 1);
    dev.app.resourceCountIs('AWS::KinesisFirehose::DeliveryStream', 1);
  });
  test('the archive goes to Deep Archive and is deleted after 2 years', () => {
    dev.app.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [Match.objectLike({ ExpirationInDays: 730, Transitions: [{ StorageClass: 'DEEP_ARCHIVE', TransitionInDays: 30 }] })],
      },
    });
  });
});

describe('deploy access (ADR-032 d2)', () => {
  const trust = (t: typeof dev.deployAccess) =>
    Object.values(t.findResources('AWS::IAM::Role'))[0].Properties.AssumeRolePolicyDocument.Statement[0];
  test('trusts exactly one repository and GitHub environment, no wildcards', () => {
    assert.deepEqual(trust(dev.deployAccess).Condition, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': 'repo:jessicamvega6/bladebook:environment:dev',
      },
    });
    assert.equal(
      trust(prod.deployAccess).Condition.StringEquals['token.actions.githubusercontent.com:sub'],
      'repo:jessicamvega6/bladebook:environment:production',
    );
    assert.doesNotMatch(JSON.stringify(trust(dev.deployAccess)), /\*/);
  });
  test('can only assume CDK\'s bootstrap roles', () => {
    const statements = Object.values(dev.deployAccess.findResources('AWS::IAM::Policy'))[0].Properties.PolicyDocument.Statement;
    assert.equal(statements.length, 1);
    assert.deepEqual(statements[0].Action, ['sts:AssumeRole', 'sts:TagSession']);
    assert.equal(statements[0].Resource.length, 4);
  });
});

describe('the table (ADR-MASTER §3, §20)', () => {
  const table = (b: typeof dev) => Object.values(b.app.findResources('AWS::DynamoDB::Table'))[0]!;
  test('one table: PK and SK, on demand, stream with both images, TTL on expiresAt, recovery on', () => {
    dev.app.resourceCountIs('AWS::DynamoDB::Table', 1);
    dev.app.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'bladebook-dev',
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });
  test('four indexes, each projecting ALL', () => {
    const gsis = table(dev).Properties.GlobalSecondaryIndexes as { IndexName: string; Projection: unknown; KeySchema: unknown }[];
    assert.deepEqual(gsis.map((g) => g.IndexName), ['GSI1', 'GSI2', 'GSI3', 'GSI4']);
    for (const g of gsis) {
      assert.deepEqual(g.Projection, { ProjectionType: 'ALL' });
      assert.deepEqual(g.KeySchema, [
        { AttributeName: `${g.IndexName}PK`, KeyType: 'HASH' },
        { AttributeName: `${g.IndexName}SK`, KeyType: 'RANGE' },
      ]);
    }
  });
  test('production keeps the table, with deletion protection, and imports nothing', () => {
    const t = table(prod);
    assert.equal(t.DeletionPolicy, 'Retain');
    assert.equal(t.Properties.DeletionProtectionEnabled, true);
    assert.equal(t.Properties.ImportSourceSpecification, undefined);
  });
  test('dev deletes it, and creates it from the seed bucket (ADR-028 d1)', () => {
    const t = table(dev);
    assert.equal(t.DeletionPolicy, 'Delete');
    assert.equal(t.Properties.DeletionProtectionEnabled, false);
    const src = t.Properties.ImportSourceSpecification;
    assert.equal(src.InputFormat, 'DYNAMODB_JSON');
    assert.equal(src.InputCompressionType, 'GZIP');
    assert.equal(src.S3BucketSource.S3KeyPrefix, 'seed/current/');
  });
});

describe('dev test accounts and seed bucket (ADR-027 d3, ADR-028, I15, I18)', () => {
  test('addresses are tags on the owner\'s mailbox', () => {
    const accounts = testAccounts('box+dev@example.test', { coaches: 2, clients: 2 });
    assert.deepEqual(accounts.map((a) => [a.email, a.group]), [
      ['box+dev-coach-a@example.test', 'Coach'],
      ['box+dev-coach-b@example.test', 'Coach'],
      ['box+dev-client-1@example.test', 'Client'],
      ['box+dev-client-2@example.test', 'Client'],
    ]);
    assert.equal(testAccounts('box@example.test', { coaches: 1, clients: 0 })[0]!.email, 'box+dev-coach-a@example.test');
    assert.throws(() => testAccounts('not an address', { coaches: 1, clients: 0 }));
  });
  test('without the mailbox setting, no accounts are made', () => {
    dev.identity.resourceCountIs('AWS::CloudFormation::CustomResource', 0);
    dev.identity.resourceCountIs('AWS::SecretsManager::Secret', 0);
  });
  test('with it: three coaches and ten families, one password in Secrets Manager, the mailbox domain verified', () => {
    const withMailbox = build(testDev, { testMailbox: TEST_MAILBOX });
    const res = Object.values(withMailbox.identity.findResources('AWS::CloudFormation::CustomResource'));
    assert.equal(res.length, 1);
    const accounts = JSON.parse(res[0]!.Properties.Accounts as string) as { email: string; group: string }[];
    assert.equal(accounts.filter((a) => a.group === 'Coach').length, 3);
    assert.equal(accounts.filter((a) => a.group === 'Client').length, 10);
    assert.ok(accounts.every((a) => a.email.endsWith('@mailbox.test')));
    withMailbox.identity.resourceCountIs('AWS::SecretsManager::Secret', 1);
    withMailbox.identity.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'mailbox.test' });
  });
  test('the seed bucket is in the account stack, private, and dev only', () => {
    dev.identity.resourceCountIs('AWS::S3::Bucket', 1);
    prod.identity.resourceCountIs('AWS::S3::Bucket', 0);
  });
});

