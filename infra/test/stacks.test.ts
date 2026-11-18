import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Match } from 'aws-cdk-lib/assertions';
import { testAccounts } from '../lib/test-accounts.ts';
import { apiRequestCode, REFUSAL_MESSAGE, siteRequestCode, spaRoutingCode, VIEWER_IP_HEADER } from '../lib/website.ts';
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
  test('attached to the user pool and the API\'s stage; logs only matched requests, Authorization redacted', () => {
    const attached = Object.values(prod.app.findResources('AWS::WAFv2::WebACLAssociation'))
      .map((a) => JSON.stringify(a.Properties.ResourceArn));
    assert.equal(attached.length, 2);
    assert.ok(attached.some((a) => a.includes('UserPool')));
    assert.ok(attached.some((a) => a.includes('/restapis/') && a.includes('/stages/') && a.includes('RestApiDeploymentStagelive')));
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


describe('the database gate (ADR-MASTER §16, ADR-022)', () => {
  type Statement = { Sid?: string; Action: string | string[]; Resource?: unknown; Condition?: Record<string, Record<string, unknown>> };
  const roles = dev.app.findResources('AWS::IAM::Role');
  const policies = dev.app.findResources('AWS::IAM::Policy');
  const byDescription = (start: string) => {
    const found = Object.entries(roles).filter(([, r]) => String(r.Properties.Description).startsWith(start));
    assert.equal(found.length, 1, `one role described "${start}…"`);
    return found[0]!;
  };
  const inline = (start: string): Statement[] =>
    byDescription(start)[1].Properties.Policies[0].PolicyDocument.Statement as Statement[];
  const actions = (s: Statement): string[] => [s.Action].flat();
  /** Every statement in the AWS::IAM::Policy resources attached to the role. */
  const attached = (start: string): Statement[] => {
    const [id] = byDescription(start);
    return Object.values(policies)
      .filter((p) => (p.Properties.Roles as { Ref: string }[]).some((r) => r.Ref === id))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as Statement[]);
  };

  test('neither API role holds a DynamoDB action: only its tenant roles, and reading the origin secret', () => {
    for (const fn of ['api-coach:', 'api-client:']) {
      const statements = attached(fn);
      assert.ok(statements.length > 0);
      for (const s of statements) {
        const a = actions(s).sort();
        if (a[0]!.startsWith('secretsmanager:')) {
          assert.deepEqual(a, ['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue']);
          assert.ok(JSON.stringify(s.Resource).includes('OriginSecret'));
        } else {
          assert.deepEqual(a, ['sts:AssumeRole', 'sts:SetSourceIdentity', 'sts:TagSession']);
        }
      }
      assert.ok(!JSON.stringify(byDescription(fn)[1]).includes('dynamodb:'));
    }
  });

  test('coach-tenant: only api-coach, only the coachId tag, only the coach\'s partition and GSI3', () => {
    const [, role] = byDescription('coach-tenant:');
    const trust = role.Properties.AssumeRolePolicyDocument.Statement[0];
    assert.deepEqual(trust.Condition['ForAllValues:StringEquals']['aws:TagKeys'], ['coachId']);
    assert.deepEqual(trust.Condition.Null, { 'aws:RequestTag/coachId': 'false' });
    // Setting the source identity is its own statement: STS checks it without the tags (found in dev, 2026-11-17).
    const source = role.Properties.AssumeRolePolicyDocument.Statement[1];
    assert.equal(source.Action, 'sts:SetSourceIdentity');
    assert.deepEqual(source.Principal, trust.Principal);
    assert.equal(role.Properties.AssumeRolePolicyDocument.Statement.length, 2);
    const [own, code] = inline('coach-tenant:');
    assert.deepEqual(own!.Condition!['ForAllValues:StringEquals'], { 'dynamodb:LeadingKeys': ['COACH#${aws:PrincipalTag/coachId}'] });
    assert.ok(JSON.stringify(own!.Resource).includes('/index/GSI3'));
    assert.ok(!JSON.stringify(own!.Resource).match(/GSI[124]/));
    assert.ok(!actions(code!).includes('dynamodb:GetItem'), 'no reads of CODE# items');
    assert.equal(code!.Condition!.StringEqualsIfExists!['dynamodb:ReturnValues'], 'NONE');
  });

  test('client-tenant: reads of the coach\'s partition need an ACTIVE link, a projection and the allowlist', () => {
    const [, role] = byDescription('client-tenant:');
    const trust = role.Properties.AssumeRolePolicyDocument.Statement[0];
    assert.deepEqual(trust.Condition['ForAllValues:StringEquals']['aws:TagKeys'], ['clientId', 'coachId', 'linkStatus']);
    const statements = inline('client-tenant:');
    const read = statements.find((s) => s.Sid === 'CoachPartitionPublicRead')!;
    assert.deepEqual(read.Condition!.StringEquals, { 'dynamodb:Select': 'SPECIFIC_ATTRIBUTES', 'aws:PrincipalTag/linkStatus': 'ACTIVE' });
    const allowed = read.Condition!['ForAllValues:StringEquals']!['dynamodb:Attributes'] as string[];
    // Nothing that names or reaches a person (ADR-022, 2026-11-17).
    for (const personal of ['studentName', 'clientName', 'clientEmail', 'clientPhone', 'clientId', 'studentId', 'loginEmail',
      'pendingLeave', 'paymentInstructions', 'registrationNumber']) {
      assert.ok(!allowed.includes(personal), `${personal} must not be readable`);
    }
    const write = statements.find((s) => s.Sid === 'CoachPartitionWrite')!;
    assert.equal(write.Condition!.StringEqualsIfExists!['dynamodb:ReturnValues'], 'NONE');
    assert.ok(!statements.some((s) => actions(s).includes('dynamodb:Scan')));
    const indexes = statements.flatMap((s) => [JSON.stringify(s.Resource)]).join(' ');
    assert.ok(indexes.includes('/index/GSI1') && !indexes.match(/GSI[234]/));
  });

  test('code-lookup: untagged, one GetItem of a CODE# item\'s name fields', () => {
    const [, role] = byDescription('code-lookup:');
    assert.equal(role.Properties.AssumeRolePolicyDocument.Statement[0].Action, 'sts:AssumeRole');
    const statements = inline('code-lookup:');
    assert.equal(statements.length, 1);
    assert.deepEqual(actions(statements[0]!), ['dynamodb:GetItem']);
    assert.equal(statements[0]!.Condition!.StringEquals!['dynamodb:Select'], 'SPECIFIC_ATTRIBUTES');
  });
});

describe('US only, and the visitor\'s address for the firewall (ADR-019, I1)', () => {
  type Req = { uri: string; headers: Record<string, { value: string }> };
  const run = (code: string, country: string | undefined, uri = '/schedule', extra: Record<string, { value: string }> = {}) => {
    const handler = new Function(`${code}; return handler;`)();
    const headers = { ...extra, ...(country ? { 'cloudfront-viewer-country': { value: country } } : {}) };
    return handler({ request: { uri, headers }, viewer: { ip: '203.0.113.7' } }) as Req & {
      statusCode?: number; headers: Record<string, { value: string }>; body?: { data: string };
    };
  };
  const site = siteRequestCode(['/rinkside/', '/']);
  test('a visitor in the US gets the site', () => {
    assert.equal(run(site, 'US').uri, '/index.html');
  });
  test('elsewhere, in a US territory, or with no country, the site answers with a plain page', () => {
    for (const c of ['CA', 'FR', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', undefined]) {
      const r = run(site, c);
      assert.equal(r.statusCode, 403);
      assert.match(r.headers['content-type']!.value, /text\/html/);
      assert.ok(r.body!.data.includes(REFUSAL_MESSAGE));
    }
  });
  const api = apiRequestCode();
  test('the API answers a visitor outside the US with short JSON', () => {
    const r = run(api, 'MX', '/api/client/me');
    assert.equal(r.statusCode, 403);
    assert.deepEqual(JSON.parse(r.body!.data), { message: REFUSAL_MESSAGE });
  });
  test('the API gets the visitor\'s address, overwriting a sent one, and never a sent origin header', () => {
    const r = run(api, 'US', '/api/client/me', {
      [VIEWER_IP_HEADER]: { value: '10.0.0.1' }, 'x-bladebook-origin': { value: 'guess' },
    });
    assert.equal(r.statusCode, undefined);
    assert.equal(r.headers[VIEWER_IP_HEADER]!.value, '203.0.113.7');
    assert.equal(r.headers['x-bladebook-origin'], undefined);
  });
});

describe('the API (ADR-MASTER §1, §17)', () => {
  test('only the health checks and the coach-code lookup are public; every other route needs Cognito', () => {
    const methods = Object.values(dev.app.findResources('AWS::ApiGateway::Method'));
    const open = methods.filter((m) => m.Properties.AuthorizationType === 'NONE');
    const signedIn = methods.filter((m) => m.Properties.AuthorizationType === 'COGNITO_USER_POOLS');
    assert.equal(open.length, 3);
    assert.ok(open.every((m) => m.Properties.HttpMethod === 'GET'));
    assert.equal(signedIn.length, 2);
    assert.ok(signedIn.every((m) => m.Properties.HttpMethod === 'ANY'));
    assert.equal(open.length + signedIn.length, methods.length);
  });
  test('both functions: Java 17 on Amazon Linux 2023, arm64, their own roles, the origin secret by ARN', () => {
    const fns = Object.values(dev.app.findResources('AWS::Lambda::Function'))
      .filter((f) => String(f.Properties.FunctionName ?? '').match(/-api-(coach|client)$/));
    assert.equal(fns.length, 2);
    for (const f of fns) {
      assert.equal(f.Properties.Runtime, 'java17.al2023');
      assert.deepEqual(f.Properties.Architectures, ['arm64']);
      assert.ok(f.Properties.Environment.Variables.BLADEBOOK_ORIGINSECRETARN);
    }
  });
  test('each site sends /api/* to the API uncached, with the origin secret, US only', () => {
    for (const d of Object.values(dev.app.findResources('AWS::CloudFront::Distribution'))) {
      const api = (d.Properties.DistributionConfig.CacheBehaviors as Record<string, any>[]).find((b) => b.PathPattern === '/api/*')!;
      assert.ok(api, 'an /api/* behaviour');
      assert.equal(api.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'); // CachingDisabled
      assert.equal(api.FunctionAssociations[0].EventType, 'viewer-request');
      const origin = (d.Properties.DistributionConfig.Origins as Record<string, any>[]).find((o) => o.OriginPath === '/live')!;
      const header = origin.OriginCustomHeaders[0];
      assert.equal(header.HeaderName, 'x-bladebook-origin');
      assert.match(JSON.stringify(header.HeaderValue), /resolve:secretsmanager/);
    }
  });
});
