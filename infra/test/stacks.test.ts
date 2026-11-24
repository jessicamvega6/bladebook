import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { Match } from 'aws-cdk-lib/assertions';
import { CONSUMERS, EVENT_PATTERNS, INVITE_ATTRIBUTES, PIPE_DETAIL_TYPE, PIPE_FILTER, PIPE_SOURCE } from '../lib/consumers.ts';
import { DATA_BUCKETS, dataBucketPattern, dataDenyStatements, LOG_READS, OBJECT_READS, TABLE_READS } from '../lib/data-deny.ts';
import { EMAIL_REFUSED_LINE } from '../lib/alarms.ts';
import { templateFiles } from '../lib/email.ts';
import { JOBS } from '../lib/jobs.ts';
import { testAccounts } from '../lib/test-accounts.ts';
import { apiRequestCode, ASSET_CACHE, contentSecurityPolicy, PAGE_CACHE, REFUSAL_MESSAGE, siteConfig, siteRequestCode, spaRoutingCode, VIEWER_IP_HEADER } from '../lib/website.ts';
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
  test('a strict Content Security Policy: report-only in dev until every page is clicked through, enforced in production (I17)', () => {
    const policies = (t: typeof dev.app) => Object.values(t.findResources('AWS::CloudFront::ResponseHeadersPolicy'))
      .map((r) => r.Properties.ResponseHeadersPolicyConfig);
    for (const p of policies(prod.app)) {
      assert.equal(p.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy, contentSecurityPolicy('us-east-1'));
      assert.equal(p.SecurityHeadersConfig.ContentSecurityPolicy.Override, true);
    }
    for (const p of policies(dev.app)) {
      assert.equal(p.SecurityHeadersConfig.ContentSecurityPolicy, undefined);
      const h = p.CustomHeadersConfig.Items.find((i: { Header: string }) => i.Header === 'Content-Security-Policy-Report-Only');
      assert.equal(h.Value, contentSecurityPolicy('us-east-1'));
    }
    const enforced = build({ ...testDev, csp: 'enforce' }).app;
    for (const p of policies(enforced)) assert.ok(p.SecurityHeadersConfig.ContentSecurityPolicy);
    const csp = contentSecurityPolicy('us-east-1');
    assert.equal(csp, "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
      + "connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com; manifest-src 'self'; worker-src 'self'; frame-src 'none'; "
      + "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  });
  test('each website uploads its build: hashed files cached a year, then the pages, rechecked, then CloudFront cleared', () => {
    const uploads = Object.entries(dev.app.findResources('Custom::CDKBucketDeployment'));
    assert.equal(uploads.length, 4);
    for (const site of ['CoachSite', 'FamilySite']) {
      const mine = uploads.filter(([id]) => id.startsWith(site));
      const [assetsId, assets] = mine.find(([id]) => id.includes('UploadAssets'))!;
      const [, pages] = mine.find(([id]) => id.includes('UploadPages'))!;
      assert.equal(assets.Properties.DestinationBucketKeyPrefix, 'assets/');
      assert.deepEqual(assets.Properties.SystemMetadata, { 'cache-control': ASSET_CACHE });
      assert.deepEqual(pages.Properties.SystemMetadata, { 'cache-control': PAGE_CACHE });
      for (const u of [assets, pages]) assert.equal(u.Properties.Prune, false);
      assert.deepEqual(pages.Properties.DistributionPaths, ['/*']);
      assert.ok(assets.Properties.DistributionId === undefined, 'the assets alone don\'t clear CloudFront');
      assert.ok(JSON.stringify(pages.DependsOn ?? []).includes(assetsId.slice(0, 20)), `${site}: pages after assets`);
      // config.json: the region, the user pool and this website's own app client, from the account stack (I32's batch).
      const markers = JSON.stringify(pages.Properties.SourceMarkers);
      assert.match(markers, /UserPool/, `${site}: config.json names the user pool`);
      assert.match(markers, site === 'CoachSite' ? /CoachWebClient/ : /FamilyWebClient/, `${site}: names its own app client`);
      assert.doesNotMatch(markers, site === 'CoachSite' ? /FamilyWebClient/ : /CoachWebClient/, `${site}: not the other's`);
    }
  });
  test('config.json holds what the sign-in forms need and nothing else', () => {
    assert.deepEqual(siteConfig('us-east-1', { userPoolId: 'us-east-1_X', appClientId: 'abc' }),
      { region: 'us-east-1', userPoolId: 'us-east-1_X', appClientId: 'abc' });
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
  test('production: the origin rule, three managed groups and five rate rules, counting at first', () => {
    const rules = prodAcl.Rules as Array<Record<string, any>>;
    assert.equal(rules.length, 9);
    const limits = Object.fromEntries(
      rules.filter((r) => r.Statement.RateBasedStatement).map((r) => [r.Name, r.Statement.RateBasedStatement.Limit]),
    );
    assert.deepEqual(limits, { 'rate-all-api': 1000, 'rate-all-cognito': 1000, 'rate-public-lookups': 20,
      'rate-cognito-auth': 10, 'rate-health': 100 });
    for (const r of rules) {
      if (r.Statement.ManagedRuleGroupStatement) assert.deepEqual(r.OverrideAction, { Count: {} });
      else assert.deepEqual(r.Action, { Count: {} });
    }
  });
  const rule = (name: string) => (prodAcl.Rules as Array<Record<string, any>>).find((r) => r.Name === name)!;
  test('the API\'s rate rules count the visitor\'s address from CloudFront\'s header; Cognito\'s the connecting address', () => {
    for (const name of ['rate-all-api', 'rate-public-lookups', 'rate-health']) {
      const r = rule(name).Statement.RateBasedStatement;
      assert.equal(r.AggregateKeyType, 'FORWARDED_IP', name);
      assert.deepEqual(r.ForwardedIPConfig, { HeaderName: 'x-bladebook-viewer-ip', FallbackBehavior: 'NO_MATCH' }, name);
      assert.match(JSON.stringify(r.ScopeDownStatement), /\.execute-api\./, name);
    }
    for (const name of ['rate-all-cognito', 'rate-cognito-auth']) {
      const r = rule(name).Statement.RateBasedStatement;
      assert.equal(r.AggregateKeyType, 'IP', name);
      assert.match(JSON.stringify(r.ScopeDownStatement), /NotStatement/, name);
    }
    // The reputation list sees only Cognito: API requests arrive from CloudFront's addresses (I1).
    assert.ok(rule('AWSManagedRulesAmazonIpReputationList').Statement.ManagedRuleGroupStatement.ScopeDownStatement.NotStatement);
  });
  test('an API request without CloudFront\'s origin secret is refused first, and the secret isn\'t in the template', () => {
    const r = rule('origin-header');
    assert.equal(r.Priority, 0);
    const [isApi, notSecret] = r.Statement.AndStatement.Statements;
    assert.match(JSON.stringify(isApi), /\.execute-api\./);
    const match = notSecret.NotStatement.Statement.ByteMatchStatement;
    assert.deepEqual(match.FieldToMatch, { SingleHeader: { Name: 'x-bladebook-origin' } });
    assert.match(JSON.stringify(match.SearchString), /resolve:secretsmanager/);
  });
  test('-c waf=block switches dev\'s on for a rehearsal; production\'s can\'t be switched off', () => {
    const on = build(testDev, { waf: 'block' });
    on.app.resourceCountIs('AWS::WAFv2::WebACL', 1);
    assert.throws(() => build(testProd, { waf: 'off' }), /never off in production/);
    assert.throws(() => build(testDev, { waf: 'maybe' }), /block, count or off/);
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
  test('both API functions, the seven consumers and the five jobs are told the group, and may write to it only (no reading; I12)', () => {
    const fns = Object.values(dev.app.findResources('AWS::Lambda::Function'))
      .filter((f) => String(f.Properties.FunctionName ?? '').match(/-(api-(coach|client)|consumer-[a-z-]+|sched-[a-z-]+)$/))
      // The archiver reads no one's data for anyone: it isn't told the group and may not write to it.
      .filter((f) => !String(f.Properties.FunctionName).endsWith('-consumer-ttl-archiver'));
    assert.equal(fns.length, 14);
    for (const f of fns) assert.match(JSON.stringify(f.Properties.Environment.Variables.BLADEBOOK_ACCESSLOGGROUP), /DataAccessLog/);
    const grants = Object.values(dev.app.findResources('AWS::IAM::Policy'))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, any>[])
      .filter((st) => /"DataAccessLog[0-9A-F]{8}","Arn"/.test(JSON.stringify(st.Resource ?? '')));
    assert.equal(grants.length, 14);
    for (const g of grants) assert.deepEqual([g.Action].flat().sort(), ['logs:CreateLogStream', 'logs:PutLogEvents']);
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
        'token.actions.githubusercontent.com:sub': 'repo:jessicamvega6@167584982/bladebook@1315357281:environment:dev',
      },
    });
    assert.equal(
      trust(prod.deployAccess).Condition.StringEquals['token.actions.githubusercontent.com:sub'],
      'repo:jessicamvega6@167584982/bladebook@1315357281:environment:production',
    );
    assert.doesNotMatch(JSON.stringify(trust(dev.deployAccess)), /\*/);
  });
  const statements = () => Object.values(dev.deployAccess.findResources('AWS::IAM::Policy'))[0].Properties.PolicyDocument.Statement;
  test('may assume only CDK\'s deploy and file-publishing roles, never the lookup role (I13)', () => {
    const allows = statements().filter((s: { Effect: string }) => s.Effect === 'Allow');
    assert.equal(allows.length, 1);
    assert.deepEqual(allows[0].Action, ['sts:AssumeRole', 'sts:TagSession']);
    const roles = JSON.stringify(allows[0].Resource);
    assert.match(roles, /cdk-hnb659fds-deploy-role-/);
    assert.match(roles, /cdk-hnb659fds-file-publishing-role-/);
    assert.doesNotMatch(roles, /lookup|image-publishing/);
  });
  test('carries the data denies too, as a second layer (I13)', () => {
    const denies = statements().filter((s: { Effect: string }) => s.Effect === 'Deny');
    assert.deepEqual(denies.map((s: { Sid: string }) => s.Sid), ['NoTableItems', 'NoAccessLog', 'NoDataObjects']);
    assert.deepEqual(denies[0].Action, TABLE_READS);
  });
});

describe('the data denies (ADR-032, I13)', () => {
  const [items, log, objects] = dataDenyStatements(testDev);
  test('table items: every read and export, on every table in the account', () => {
    for (const a of ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:PartiQLSelect',
      'dynamodb:ExportTableToPointInTime', 'dynamodb:GetRecords']) assert.ok(items!.Action.includes(a), a);
    assert.deepEqual(items!.Resource, [`arn:aws:dynamodb:*:${testDev.account}:table/*`]);
  });
  test('the access-log group\'s lines, and nothing that isn\'t a read', () => {
    assert.deepEqual(log!.Action, LOG_READS);
    assert.deepEqual(log!.Resource, [
      `arn:aws:logs:us-east-1:${testDev.account}:log-group:/bladebook-dev/access-log`,
      `arn:aws:logs:us-east-1:${testDev.account}:log-group:/bladebook-dev/access-log:*`,
    ]);
    for (const a of log!.Action) assert.doesNotMatch(a, /Put|Create(LogGroup|LogStream)|Subscription/);
  });
  test('the data buckets\' objects match the names CloudFormation generates; not the seed or website buckets', () => {
    assert.deepEqual(objects!.Action, OBJECT_READS);
    const buckets = Object.keys(dev.app.findResources('AWS::S3::Bucket'));
    for (const b of DATA_BUCKETS) {
      // A generated name is `<stack>-<logical ID>-<random>`, lowercased.
      const named = buckets.filter((id) => `bladebook-dev-app-${id.toLowerCase()}`.startsWith(dataBucketPattern(testDev, b)));
      assert.equal(named.length, 1, `${b}: ${named.join(', ')}`);
    }
    const seed = Object.keys(dev.identity.findResources('AWS::S3::Bucket'));
    assert.equal(seed.length, 1);
    for (const p of objects!.Resource) {
      assert.doesNotMatch(p, /identity|seed|site/i);
      assert.ok(!`bladebook-dev-identity-${seed[0]!.toLowerCase()}`.startsWith(p.slice('arn:aws:s3:::'.length, -3)));
    }
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


describe('the gate tests\' role (ADR-021 d7, ADR-022 d9, I11)', () => {
  const role = (t: typeof dev.app) => Object.entries(t.findResources('AWS::IAM::Role'))
    .filter(([, r]) => r.Properties.RoleName === 'bladebook-dev-gate-test' || r.Properties.RoleName === 'bladebook-prod-gate-test');
  const tenants = (t: typeof dev.app) => Object.values(t.findResources('AWS::IAM::Role'))
    .filter((r) => /^(coach-tenant|client-tenant|code-lookup):/.test(String(r.Properties.Description)));
  test('dev only: production has no gate role, and its tenant roles trust only the APIs', () => {
    assert.equal(role(prod.app).length, 0);
    assert.equal(role(dev.app).length, 1);
    for (const r of tenants(prod.app)) assert.doesNotMatch(JSON.stringify(r.Properties.AssumeRolePolicyDocument), /GateTest/);
  });
  test('in dev each tenant role trusts it beside its API, under the same tag rules', () => {
    const [id] = role(dev.app)[0]!;
    assert.equal(tenants(dev.app).length, 3);
    for (const r of tenants(dev.app)) {
      for (const st of r.Properties.AssumeRolePolicyDocument.Statement) {
        const aws = JSON.stringify(st.Principal.AWS);
        assert.match(aws, new RegExp(id), 'the gate role is a principal');
        assert.match(aws, /ApiC(oach|lient)Role/, 'beside the API');
      }
    }
  });
  test('it can only start tenant sessions: no DynamoDB, nothing else', () => {
    const [id] = role(dev.app)[0]!;
    const statements = Object.values(dev.app.findResources('AWS::IAM::Policy'))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes(id))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as { Action: string[] }[]);
    assert.deepEqual(statements.flatMap((st) => [st.Action].flat()).sort(),
      ['sts:AssumeRole', 'sts:SetSourceIdentity', 'sts:TagSession']);
    assert.ok(!JSON.stringify(role(dev.app)[0]![1].Properties).includes('dynamodb'));
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
          assert.deepEqual(a, ['secretsmanager:GetSecretValue']);
          assert.ok(JSON.stringify(s.Resource).includes('OriginSecret'));
        } else if (a[0]!.startsWith('logs:')) {
          assert.deepEqual(a, ['logs:CreateLogStream', 'logs:PutLogEvents']);
          assert.match(JSON.stringify(s.Resource), /DataAccessLog/);
        } else if (a[0]!.startsWith('ses:')) {
          assert.equal(fn, 'api-coach:'); // its one template: the email tests below
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

describe('email (ADR-MASTER §13; §2, I9)', () => {
  const policies = (t: typeof dev.app, roleRef: RegExp) => Object.values(t.findResources('AWS::IAM::Policy'))
    .filter((p) => (p.Properties.Roles as { Ref: string }[]).some((r) => roleRef.test(r.Ref)))
    .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, any>[]);
  const ses = (statements: Record<string, any>[]) =>
    statements.filter((s) => [s.Action].flat().some((a: string) => a.startsWith('ses:')));

  test('every built template is loaded into SES under its own name', () => {
    const names = templateFiles().map((t) => t.TemplateName).sort();
    assert.ok(names.includes('business-email-confirmation'));
    const loaded = Object.values(dev.app.findResources('AWS::SES::Template')).map((t) => t.Properties.Template.TemplateName);
    assert.deepEqual(loaded.sort(), names);
  });
  test('api-coach may send the business-email confirmation only, from the sending address only', () => {
    const [s, ...more] = ses(policies(dev.app, /ApiCoachRole/));
    assert.equal(more.length, 0);
    assert.equal(s.Action, 'ses:SendTemplatedEmail');
    assert.deepEqual(s.Condition, { StringEquals: { 'ses:FromAddress': 'lessons@dev.bladebook.org' } });
    const templates = JSON.stringify(s.Resource).match(/:template\/[\w-]+/g);
    assert.deepEqual(templates, [':template/business-email-confirmation']);
    assert.ok(!JSON.stringify(s.Resource).includes('template/*'));
  });
  test('api-client and the tenant roles may send no email', () => {
    for (const role of [/ApiClientRole/, /CoachTenant/, /ClientTenant/, /CodeLookup/]) {
      assert.deepEqual(ses(policies(dev.app, role)), [], role.source);
    }
    for (const r of Object.values(dev.app.findResources('AWS::IAM::Role'))) {
      assert.ok(!JSON.stringify(r.Properties.Policies ?? []).includes('ses:'));
    }
  });
  test('api-coach is told the sending addresses, in each environment its own', () => {
    // Production can't be built without an email domain (2026-11-21); the tests stand one in until Batch 29.
    for (const [t, domain] of [[dev.app, 'dev.bladebook.org'], [prod.app, 'bladebook.org']] as const) {
      const coach = Object.values(t.findResources('AWS::Lambda::Function'))
        .find((f) => String(f.Properties.FunctionName).endsWith('-api-coach'))!;
      assert.equal(coach.Properties.Environment.Variables.BLADEBOOK_MAIL_FROM, `lessons@${domain}`);
      assert.equal(coach.Properties.Environment.Variables.BLADEBOOK_MAIL_NOREPLY, `no-reply@${domain}`);
    }
  });
});

// ------------------------------------------------------------------------------------------- the event backbone

/**
 * The part of EventBridge's pattern matching the patterns use: exact strings, prefix, anything-but, exists, and $or.
 * The live check against EventBridge's own TestEventPattern is in infra/README.md.
 */
function matches(pattern: Record<string, unknown>, value: unknown): boolean {
  return Object.entries(pattern).every(([k, p]) => {
    if (k === '$or') return (p as Record<string, unknown>[]).some((alt) => matches(alt, value));
    const v = (value as Record<string, unknown> | undefined)?.[k];
    if (Array.isArray(p)) {
      return p.some((m) => {
        if (typeof m === 'string') return v === m;
        const [op, arg] = Object.entries(m as Record<string, unknown>)[0]!;
        if (op === 'prefix') return typeof v === 'string' && v.startsWith(arg as string);
        if (op === 'anything-but') return typeof v === 'string' && v !== arg;
        if (op === 'exists') return (v !== undefined) === arg;
        throw new Error(`matcher ${op} isn't modelled`);
      });
    }
    return matches(p as Record<string, unknown>, v);
  });
}

type Image = Record<string, string | Record<string, unknown>>;
const typed = (img?: Image) => img && Object.fromEntries(Object.entries(img).map(([k, v]) =>
  [k, typeof v === 'string' ? { S: v } : { M: Object.fromEntries(Object.entries(v).map(([a, b]) => [a, { S: b }])) }]));
function rec(eventName: string, pk: string, sk: string, newImage?: Image, oldImage?: Image, ttl = false) {
  return {
    eventName,
    dynamodb: { Keys: { PK: { S: pk }, SK: { S: sk } }, NewImage: typed(newImage), OldImage: typed(oldImage) },
    ...(ttl ? { userIdentity: { type: 'Service', principalId: 'dynamodb.amazonaws.com' } } : {}),
  };
}

const SEAT = 'SEAT#2026-11-23#06:00#s1';
/** Each event's records: the ones it must match, and near misses it mustn't. */
const SAMPLES: Record<string, { match: object[]; miss: object[] }> = {
  LessonBooked: {
    match: [rec('INSERT', 'COACH#c', SEAT, { seatStatus: 'BOOKED' }),
      rec('MODIFY', 'COACH#c', SEAT, { seatStatus: 'BOOKED' }, { seatStatus: 'INVITED' })],
    miss: [rec('MODIFY', 'COACH#c', SEAT, { seatStatus: 'BOOKED' }, { seatStatus: 'BOOKED' }),
      rec('INSERT', 'COACH#c', SEAT, { seatStatus: 'INVITED' }), rec('REMOVE', 'COACH#c', SEAT, undefined, { seatStatus: 'BOOKED' }),
      rec('INSERT', 'COACH#c', 'SEATEND#2026-11-23#06:00#s1#t', { seatStatus: 'BOOKED' })],
  },
  CheckInRecorded: {
    match: [rec('MODIFY', 'COACH#c', SEAT, { seatStatus: 'CHECKED_IN' }, { seatStatus: 'BOOKED' })],
    miss: [rec('MODIFY', 'COACH#c', SEAT, { seatStatus: 'CHECKED_IN' }, { seatStatus: 'CHECKED_IN' }),
      rec('MODIFY', 'COACH#c', SEAT, { seatStatus: 'NO_SHOW' }, { seatStatus: 'BOOKED' })],
  },
  ScheduleChanged: {
    match: [rec('MODIFY', 'COACH#c', 'SCHEDULE#DEFAULT', {}, {}), rec('INSERT', 'COACH#c', 'SCHEDULE#DATE#2026-11-23', {}),
      rec('REMOVE', 'COACH#c', 'SCHEDULE#DATE#2026-11-23', undefined, {})],
    miss: [rec('INSERT', 'COACH#c', 'SCHEDULE#TEMP#t1', {}), rec('MODIFY', 'COACH#c', 'PROFILE', {}, {})],
  },
  LessonsChanged: {
    match: [rec('MODIFY', 'COACH#c', 'CHANGEBATCH#2026-11-18T12:00:00.000Z#b', { executionStatus: 'EXECUTED' }, { executionStatus: 'PLANNED' }),
      rec('INSERT', 'COACH#c', 'CHANGEBATCH#2026-11-18T12:00:00.000Z#b', { executionStatus: 'EXECUTED' })],
    miss: [rec('MODIFY', 'COACH#c', 'CHANGEBATCH#2026-11-18T12:00:00.000Z#b', { executionStatus: 'EXECUTED' }, { executionStatus: 'EXECUTED' }),
      rec('MODIFY', 'COACH#c', 'CANCELLED#2026-11-18T12:00:00.000Z#b#x', { executionStatus: 'EXECUTED' }, { executionStatus: 'PLANNED' })],
  },
  StudentChanged: {
    match: [rec('MODIFY', 'COACH#c', 'STUDENT#s1', { studentStatus: 'ACTIVE' }, { studentStatus: 'PENDING' }),
      rec('REMOVE', 'COACH#c', 'STUDENT#s1', undefined, { studentStatus: 'PENDING' })],
    miss: [rec('MODIFY', 'COACH#c', 'STUDENT#s1', { studentStatus: 'ACTIVE' }, { studentStatus: 'ACTIVE' }),
      rec('INSERT', 'COACH#c', 'STUDENT#s1', { studentStatus: 'PENDING' }),
      rec('MODIFY', 'CLIENT#f', 'STUDENT#c#s1', { studentStatus: 'ACTIVE' }, { studentStatus: 'PENDING' })],
  },
  FamilyChanged: {
    match: [rec('MODIFY', 'CLIENT#f', 'PROFILE', {}, {}), rec('INSERT', 'CLIENT#f', 'SKATER#s1', {})],
    miss: [rec('REMOVE', 'CLIENT#f', 'SKATER#s1', undefined, {}), rec('MODIFY', 'CLIENT#f', 'STUDENT#c#s1', {}, {}),
      rec('MODIFY', 'COACH#c', 'PROFILE', {}, {})],
  },
  SharedLessonChanged: {
    match: [rec('MODIFY', 'COACH#c', SEAT, {}, {}), rec('INSERT', 'COACH#c', 'SEATEND#2026-11-23#06:00#s1#t', {}),
      rec('MODIFY', 'COACH#c', 'LESSON#2026-11-23#06:00', { pendingLeave: { leaveId: 'l1' } }, {}),
      rec('MODIFY', 'COACH#c', 'LESSON#2026-11-23#06:00', {}, { pendingLeave: { leaveId: 'l1' } })],
    miss: [rec('MODIFY', 'COACH#c', 'LESSON#2026-11-23#06:00', {}, {}), rec('MODIFY', 'CLIENT#f', 'SEAT#x', {}, {})],
  },
};

describe('the event backbone (ADR-MASTER §2, §3, I6)', () => {
  test('every event pattern matches its records and none of its near misses', () => {
    assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(EVENT_PATTERNS).sort());
    for (const [event, { match, miss }] of Object.entries(SAMPLES)) {
      for (const r of match) assert.ok(matches(EVENT_PATTERNS[event]!, r), `${event} should match ${JSON.stringify(r)}`);
      for (const r of miss) assert.ok(!matches(EVENT_PATTERNS[event]!, r), `${event} shouldn't match ${JSON.stringify(r)}`);
    }
  });
  test('no event matches another event\'s records unless both consumers want them', () => {
    // A booked seat is also a shared-lesson seat change: consumer-invite checks for a partner. Nothing else overlaps.
    const allowed = new Set(['LessonBooked>SharedLessonChanged', 'CheckInRecorded>SharedLessonChanged']);
    for (const [owner, { match }] of Object.entries(SAMPLES)) {
      for (const r of match) {
        for (const other of Object.keys(EVENT_PATTERNS)) {
          if (other === owner || allowed.has(`${owner}>${other}`)) continue;
          assert.ok(!matches(EVENT_PATTERNS[other]!, r), `${other} matched ${owner}'s ${JSON.stringify(r)}`);
        }
      }
    }
  });
  test('the Pipe passes every record but a TTL removal', () => {
    assert.ok(matches(PIPE_FILTER, rec('INSERT', 'COACH#c', SEAT, {})));
    assert.ok(matches(PIPE_FILTER, rec('REMOVE', 'COACH#c', 'STUDENT#s1', undefined, {})));
    assert.ok(!matches(PIPE_FILTER, rec('REMOVE', 'COACH#c', SEAT, undefined, {}, true)));
  });
  test('one Pipe: the table\'s stream onto the bus, unchanged, with its own dead-letter queue', () => {
    dev.app.resourceCountIs('AWS::Pipes::Pipe', 1);
    dev.app.hasResourceProperties('AWS::Pipes::Pipe', {
      Source: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Table[0-9A-F]{8}$'), 'StreamArn'] },
      SourceParameters: {
        DynamoDBStreamParameters: Match.objectLike({ StartingPosition: 'LATEST', DeadLetterConfig: { Arn: Match.anyValue() } }),
        FilterCriteria: { Filters: [{ Pattern: JSON.stringify(PIPE_FILTER) }] },
      },
      TargetParameters: { EventBridgeEventBusParameters: { Source: PIPE_SOURCE, DetailType: PIPE_DETAIL_TYPE } },
    });
    const pipe = Object.values(dev.app.findResources('AWS::Pipes::Pipe'))[0]!;
    assert.equal(pipe.Properties.Enrichment, undefined); // no enrichment function (I6)
  });
  test('each consumer: one rule of its event\'s name on the bus, and one dead-letter queue for the rule and the function', () => {
    const rules = Object.values(dev.app.findResources('AWS::Events::Rule'));
    const fns = dev.app.findResources('AWS::Lambda::Function');
    for (const c of CONSUMERS) {
      const rule = rules.find((r) => r.Properties.Name === `bladebook-dev-${c.event}`);
      assert.ok(rule, c.event);
      assert.deepEqual(rule.Properties.EventPattern.detail, EVENT_PATTERNS[c.event]);
      assert.deepEqual(rule.Properties.EventPattern.source, [PIPE_SOURCE]);
      const [target] = rule.Properties.Targets;
      const [fnId, fn] = Object.entries(fns).find(([, f]) => f.Properties.FunctionName === `bladebook-dev-${c.name}`)!;
      assert.deepEqual(target.Arn, { 'Fn::GetAtt': [fnId, 'Arn'] });
      assert.deepEqual(target.DeadLetterConfig.Arn, fn.Properties.DeadLetterConfig.TargetArn);
      assert.equal(fn.Properties.Handler, `com.bladebook.consumers.handler.${c.handler}::handleRequest`);
    }
    assert.equal(rules.length, CONSUMERS.length);
  });
  test('a consumer writes only its own log group, and only those that email get SES, for their templates alone', () => {
    const roles = dev.app.findResources('AWS::IAM::Role');
    const policies = Object.values(dev.app.findResources('AWS::IAM::Policy'));
    for (const c of CONSUMERS) {
      const [roleId, role] = Object.entries(roles).find(([id]) => id.startsWith(`Consumers${c.handler}Role`))!;
      assert.equal(role.Properties.ManagedPolicyArns, undefined, `${c.name} has no managed policy`);
      const statements = policies.filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
        .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, any>[]);
      const ses = statements.filter((st) => [st.Action].flat().some((a: string) => a.startsWith('ses:')));
      if (c.templates.length === 0) {
        assert.equal(ses.length, 0, `${c.name} sends nothing`);
      } else {
        const named = JSON.stringify(ses);
        for (const t of c.templates) assert.ok(named.includes(`template/${t}`), `${c.name} may send ${t}`);
        assert.equal((named.match(/template\//g) ?? []).length, c.templates.length, `${c.name}: its templates only`);
      }
      const logs = statements.filter((st) => [st.Action].flat().some((a: string) => a.startsWith('logs:')));
      assert.equal(logs.length, 2, `${c.name}: its own group and the access log`);
    }
  });
});

describe('the consumers\' roles (ADR-MASTER §2; owner, 2026-11-18)', () => {
  const statementsOf = (handler: string) => {
    const [roleId] = Object.entries(dev.app.findResources('AWS::IAM::Role')).find(([id]) => id.startsWith(`Consumers${handler}Role`))!;
    return Object.values(dev.app.findResources('AWS::IAM::Policy'))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, any>[])
      .filter((st) => [st.Action].flat().some((a: string) => a.startsWith('dynamodb:')));
  };
  test('every DynamoDB statement is held to named partitions, and no consumer has an index but invite\'s GSI1', () => {
    for (const c of CONSUMERS) {
      for (const st of statementsOf(c.handler)) {
        assert.ok(st.Condition['ForAllValues:StringLike']['dynamodb:LeadingKeys'].length > 0, c.name);
        const res = JSON.stringify(st.Resource);
        if (res.includes('/index/')) assert.ok(c.name === 'consumer-invite' && res.includes('/index/GSI1'), c.name);
        assert.ok(![st.Action].flat().some((a: string) => /Scan|BatchWrite|DeleteTable/.test(a)), c.name);
      }
    }
  });
  test('consumer-invite never puts or deletes, and updates only the copies and its guards', () => {
    const sts = statementsOf('Invite');
    const actions = sts.flatMap((st) => [st.Action].flat());
    assert.ok(!actions.includes('dynamodb:PutItem') && !actions.includes('dynamodb:DeleteItem'));
    const update = sts.find((st) => [st.Action].flat().includes('dynamodb:UpdateItem'))!;
    assert.deepEqual(update.Condition['ForAllValues:StringLike']['dynamodb:Attributes'], INVITE_ATTRIBUTES);
  });
  test('only schedule-change writes lesson times; family-sync alone writes share codes', () => {
    for (const c of CONSUMERS) {
      const sts = statementsOf(c.handler);
      const puts = sts.filter((st) => [st.Action].flat().includes('dynamodb:PutItem'))
        .flatMap((st) => st.Condition['ForAllValues:StringLike']['dynamodb:LeadingKeys']);
      if (c.name === 'consumer-schedule-change') assert.deepEqual(puts, ['COACH#*']);
      else if (c.name === 'consumer-family-sync') assert.deepEqual(puts, ['SKATERCODE#*']);
      else assert.deepEqual(puts, [], c.name);
    }
  });
});

describe('the scheduled jobs (ADR-MASTER §2, §14; owner, 2026-11-18, I23)', () => {
  const schedules = () => Object.values(dev.app.findResources('AWS::Scheduler::Schedule'));
  const statementsOf = (handler: string) => {
    const [roleId] = Object.entries(dev.app.findResources('AWS::IAM::Role')).find(([id]) => id.startsWith(`Jobs${handler}Role`))!;
    return Object.values(dev.app.findResources('AWS::IAM::Policy'))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, any>[]);
  };
  test('one schedule per rule, named after it, in the launch time zone, carrying the time it is for', () => {
    const names = schedules().map((s) => s.Properties.Name).sort();
    assert.deepEqual(names, ['sched-day-reminder', 'sched-deadline-sweep', 'sched-drift-check', 'sched-lesson-roller',
      'sched-unpaid-reminder', 'sched-year-close'].map((n) => `bladebook-dev-${n}`));
    for (const s of schedules()) {
      assert.equal(s.Properties.ScheduleExpressionTimezone, 'America/Chicago');
      assert.deepEqual(JSON.parse(s.Properties.Target.Input),
        { job: s.Properties.Name.replace('bladebook-dev-', ''), scheduledTime: '<aws.scheduler.scheduled-time>' });
    }
    const yearClose = schedules().find((s) => s.Properties.Name === 'bladebook-dev-sched-year-close')!;
    const roller = schedules().find((s) => s.Properties.Name === 'bladebook-dev-sched-lesson-roller')!;
    assert.deepEqual(yearClose.Properties.Target.Arn, roller.Properties.Target.Arn); // one function (Batch 26)
    assert.equal(yearClose.Properties.ScheduleExpression, 'cron(0 8 1-7 1 ? *)');
  });
  test('only the two reminders and the drift check have a dead-letter queue', () => {
    for (const s of schedules()) {
      const reminder = /(reminder|drift-check)$/.test(s.Properties.Name);
      assert.equal(s.Properties.Target.DeadLetterConfig !== undefined, reminder, s.Properties.Name);
    }
  });
  test('each cross-coach index belongs to one job, and the coach list reads keys only', () => {
    const indexes = (h: string) => statementsOf(h).flatMap((st) => [st.Resource].flat())
      .map((r) => JSON.stringify(r)).filter((r) => r.includes('/index/')).map((r) => r.match(/index\/(GSI\d)/)![1]);
    assert.deepEqual(indexes('DayReminder'), ['GSI2']);
    assert.deepEqual(indexes('UnpaidReminder'), ['GSI3']);
    assert.deepEqual(indexes('DeadlineSweep'), ['GSI4']);
    assert.deepEqual(indexes('LessonRoller'), []);
    assert.deepEqual(indexes('DriftCheck'), ['GSI2']);
    const scans = statementsOf('LessonRoller').filter((st) => [st.Action].flat().includes('dynamodb:Scan'));
    assert.equal(scans.length, 1);
    assert.deepEqual(scans[0]!.Condition['ForAllValues:StringEquals']['dynamodb:Attributes'], ['PK', 'SK']);
    assert.equal(scans[0]!.Condition.StringEquals['dynamodb:Select'], 'SPECIFIC_ATTRIBUTES');
    const rollerWrites = statementsOf('LessonRoller').flatMap((st) => [st.Action].flat())
      .filter((a: string) => /UpdateItem|DeleteItem/.test(a));
    assert.deepEqual(rollerWrites, []); // it only adds
  });
  test('the drift check reads only, and may invoke consumer-schedule-change and nothing else', () => {
    const sts = statementsOf('DriftCheck');
    const db = sts.flatMap((st) => [st.Action].flat()).filter((a: string) => a.startsWith('dynamodb:'));
    assert.deepEqual([...new Set(db)].sort(), ['dynamodb:GetItem', 'dynamodb:Query']);
    const invoke = sts.filter((st) => [st.Action].flat().includes('lambda:InvokeFunction'));
    assert.equal(invoke.length, 1);
    assert.match(JSON.stringify(invoke[0]!.Resource), /ConsumersScheduleChange[0-9A-F]{8}/);
  });
  test('the unpaid threshold is a Parameter Store setting only the unpaid reminder may read', () => {
    dev.app.hasResourceProperties('AWS::SSM::Parameter', { Name: '/bladebook-dev/unpaid-reminder/threshold-days', Value: '7' });
    const readers = JOBS.filter((j) => statementsOf(j.handler).some((st) => [st.Action].flat().includes('ssm:GetParameter')));
    assert.deepEqual(readers.map((j) => j.name), ['sched-unpaid-reminder']);
  });
});

describe('the TTL archiver (ADR-MASTER §2, §3, §20)', () => {
  const archiverStatements = () => {
    const [roleId] = Object.entries(dev.app.findResources('AWS::IAM::Role')).find(([id]) => id.startsWith('ConsumersTtlArchiverRole'))!;
    return Object.values(dev.app.findResources('AWS::IAM::Policy'))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, any>[]);
  };
  test('it is the stream\'s only other reader, and takes TTL removals only', () => {
    const mappings = Object.values(dev.app.findResources('AWS::Lambda::EventSourceMapping'));
    assert.equal(mappings.length, 1); // with the Pipe, the stream's two readers
    const m = mappings[0]!;
    assert.match(JSON.stringify(m.Properties.EventSourceArn), /StreamArn/);
    assert.deepEqual(JSON.parse(m.Properties.FilterCriteria.Filters[0].Pattern),
      { eventName: ['REMOVE'], userIdentity: { type: ['Service'], principalId: ['dynamodb.amazonaws.com'] } });
    assert.equal(m.Properties.DestinationConfig, undefined); // no queue (§19)
  });
  test('it may put objects in the archive and read the stream, and nothing else in the data', () => {
    const actions = archiverStatements().flatMap((st) => [st.Action].flat());
    assert.ok(actions.includes('s3:PutObject') && actions.includes('s3:PutObjectTagging'));
    assert.ok(!actions.some((a: string) => /^s3:(Get|Delete|List)/.test(a)));
    const items = actions.filter((a: string) => /dynamodb:(GetItem|Query|Scan|PutItem|UpdateItem|DeleteItem|BatchGetItem)/.test(a));
    assert.deepEqual(items, []);
    const puts = archiverStatements().find((st) => [st.Action].flat().includes('s3:PutObject'))!;
    assert.match(JSON.stringify(puts.Resource), /DataArchive/);
  });
});

describe('the alarms (ADR-MASTER §16, §19; I25, I26)', () => {
  const alarmNames = (t: typeof prod.app) => Object.values(t.findResources('AWS::CloudWatch::Alarm')).map((a) => a.Properties.AlarmName).sort();
  test('off in dev unless switched on to prove they fire; never off in production', () => {
    dev.app.resourceCountIs('AWS::CloudWatch::Alarm', 0);
    const on = build(testDev, { alarms: 'on' });
    assert.ok(alarmNames(on.app).length > 10);
    on.app.resourceCountIs('AWS::Route53::HealthCheck', 0); // the up-check is production's (I26)
    assert.throws(() => build(testProd, { alarms: 'off' }), /permanently/);
  });
  test('production pages on what §19 lists, each through the one paging topic', () => {
    assert.deepEqual(alarmNames(prod.app), [
      'archiver-behind', 'change-notifier-queue', 'day-reminder-missed', 'drift-check-missed', 'drift-finish-failed',
      'drift-missed-cancellation', 'email-refused', 'never-linked-a-day', 'never-linked-one-family', 'pipe-failing', 'pipe-queue',
      'post-confirmation-errors',
      'roller-missed', 'schedule-change-queue', 'ses-bounces', 'ses-complaints', 'sweep-missed', 'unpaid-reminder-missed',
      'up-api-down', 'up-site-down',
    ].map((n) => `bladebook-prod-${n}`));
    const [topicId] = Object.keys(prod.app.findResources('AWS::SNS::Topic'));
    for (const a of Object.values(prod.app.findResources('AWS::CloudWatch::Alarm'))) {
      assert.deepEqual(a.Properties.AlarmActions, [{ Ref: topicId }], a.Properties.AlarmName);
    }
  });
  test('a refused email pages at once: every consumer\'s and job\'s log is watched for core\'s refusal line', () => {
    const filters = Object.values(prod.app.findResources('AWS::Logs::MetricFilter'))
      .filter((f) => f.Properties.MetricTransformations[0].MetricName === 'EmailsRefused');
    const fns = prod.stacks.app.consumers.functions.size + prod.stacks.app.jobs.functions.size;
    assert.equal(filters.length, fns);
    for (const f of filters) assert.equal(f.Properties.FilterPattern, `"${EMAIL_REFUSED_LINE}"`);
    const a = Object.values(prod.app.findResources('AWS::CloudWatch::Alarm')).find((x) => x.Properties.AlarmName === 'bladebook-prod-email-refused')!;
    assert.equal(a.Properties.Threshold, 1);
    assert.equal(a.Properties.MetricName, 'EmailsRefused');
    // The line the filters look for is the one core logs.
    const sending = readFileSync(new URL('../../backend/core/src/main/java/com/bladebook/core/service/Sending.java', import.meta.url), 'utf8');
    assert.ok(sending.includes(`"${EMAIL_REFUSED_LINE}: "`), 'Sending.java no longer logs the line the alarm watches');
  });
  test('production can\'t be built without an email domain', () => {
    assert.throws(() => build({ ...testProd, emailDomain: undefined }), /needs emailDomain/);
  });
  test('CloudWatch may publish to the topic, for this account\'s own alarms only', () => {
    // The topic's policy replaces SNS's default, so without this every page fails (found in dev, 2026-11-18).
    const policy = Object.values(prod.app.findResources('AWS::SNS::TopicPolicy'))[0]!.Properties.PolicyDocument.Statement as any[];
    const allow = policy.find((st) => st.Sid === 'AlarmsMayPage');
    assert.deepEqual(allow.Principal, { Service: 'cloudwatch.amazonaws.com' });
    assert.equal(allow.Action, 'sns:Publish');
    assert.ok(allow.Condition.StringEquals['aws:SourceAccount']);
    assert.match(JSON.stringify(allow.Condition.ArnLike['aws:SourceArn']), /alarm:bladebook-prod-\*/);
  });
  test('a job that stops running pages: missing data counts as not run', () => {
    const missed = Object.values(prod.app.findResources('AWS::CloudWatch::Alarm')).filter((a) => /-missed$/.test(a.Properties.AlarmName));
    assert.equal(missed.length, 5);
    for (const a of missed) assert.equal(a.Properties.TreatMissingData, 'breaching', a.Properties.AlarmName);
  });
  test('pages go only where the deploy-time settings say; nothing is in the repo', () => {
    prod.app.resourceCountIs('AWS::SNS::Subscription', 0);
    const set = build(testProd, { pagePhone: '+15555550100', pageEmail: 'pages@example.com' });
    const protocols = Object.values(set.app.findResources('AWS::SNS::Subscription')).map((s) => s.Properties.Protocol).sort();
    assert.deepEqual(protocols, ['email', 'sms']);
  });
  test('never-linked asks: a metric filter for the day and a Contributor Insights rule by family', () => {
    prod.app.hasResourceProperties('AWS::Logs::MetricFilter', { FilterPattern: '{ $.operation = "security:never-linked*" }' });
    const rule = Object.values(prod.app.findResources('AWS::CloudWatch::InsightRule'))[0]!;
    // The body names the log group by reference, so it's checked as text.
    const body = JSON.stringify(rule.Properties.RuleBody);
    assert.match(body, /\\"Keys\\":\[\\"\$\.actor\\"\]/);
    assert.match(body, /\\"StartsWith\\":\[\\"security:never-linked\\"\]/);
    assert.match(body, /DataAccessLog/);
  });
  test('the up-check checks from US locations only, so the US-only rule lets it in', () => {
    const checks = Object.values(prod.app.findResources('AWS::Route53::HealthCheck'));
    assert.equal(checks.length, 2);
    for (const c of checks) {
      assert.deepEqual(c.Properties.HealthCheckConfig.Regions, ['us-east-1', 'us-west-1', 'us-west-2']);
    }
    assert.deepEqual(checks.map((c) => c.Properties.HealthCheckConfig.ResourcePath).sort(), ['/', '/api/coach/health']);
  });
});

describe('auth-post-confirmation (ADR-023 d10)', () => {
  const fn = () => Object.entries(dev.identity.findResources('AWS::Lambda::Function'))
    .find(([, f]) => f.Properties.FunctionName === 'bladebook-dev-auth-post-confirmation')!;
  test('the user pool calls it on confirmation, named by the function\'s own fixed ARN', () => {
    const pool = Object.values(dev.identity.findResources('AWS::Cognito::UserPool'))[0]!;
    assert.match(JSON.stringify(pool.Properties.LambdaConfig.PostConfirmation), /function:bladebook-dev-auth-post-confirmation/);
    const [, f] = fn();
    assert.equal(f.Properties.Handler, 'com.bladebook.consumers.handler.PostConfirmation::handleRequest');
    assert.equal(f.Properties.Timeout, 5); // Cognito's own wait
    const env = f.Properties.Environment.Variables;
    assert.match(JSON.stringify(env.BLADEBOOK_COACHCLIENTID), /CoachWebClient/);
    assert.match(JSON.stringify(env.BLADEBOOK_FAMILYCLIENTID), /FamilyWebClient/);
  });
  test('only Cognito, for this pool, may invoke it; it may add users to groups in this pool and nothing else', () => {
    const perm = Object.values(dev.identity.findResources('AWS::Lambda::Permission'))
      .find((p) => p.Properties.Principal === 'cognito-idp.amazonaws.com')!;
    assert.match(JSON.stringify(perm.Properties.SourceArn), /UserPool/);
    const [roleId] = Object.entries(dev.identity.findResources('AWS::IAM::Role')).find(([id]) => id.startsWith('PostConfirmationRole'))!;
    const actions = Object.values(dev.identity.findResources('AWS::IAM::Policy'))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
      .flatMap((p) => (p.Properties.PolicyDocument.Statement as any[]).flatMap((st) => [st.Action].flat()));
    assert.deepEqual(actions.sort(), ['cognito-idp:AdminAddUserToGroup', 'logs:CreateLogStream', 'logs:PutLogEvents']);
    assert.equal(dev.identity.findResources('AWS::IAM::Role')[roleId]!.Properties.ManagedPolicyArns, undefined);
  });
});
