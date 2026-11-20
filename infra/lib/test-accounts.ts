// Dev's test accounts (ADR-011 8c, ADR-027 d3 and its 2026-11-17 amendment): tagged addresses on
// the owner's test mailbox, created by the account stack, each put in its group by the stack (an
// account the stack creates never runs auth-post-confirmation), one shared password kept in Secrets
// Manager. The mailbox is a deploy-time setting and never appears in the repo (the repo is public).

import { CustomResource, Duration, Stack, Validations } from 'aws-cdk-lib';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface TestAccount {
  /** `dev-coach-a`, `dev-client-1`: the tag, and the name the seed script assigns data by. */
  readonly name: string;
  readonly email: string;
  readonly group: 'Coach' | 'Client';
}

/**
 * `base` is the owner's test mailbox. A base that already carries a `+` tag gets the account's
 * name appended to that tag (`box+dev` → `box+dev-coach-a`); otherwise the name becomes the tag
 * (`box` → `box+dev-coach-a`).
 */
export function testAccounts(base: string, counts: { coaches: number; clients: number }): TestAccount[] {
  const at = base.lastIndexOf('@');
  if (at < 1 || at === base.length - 1 || /\s/.test(base)) throw new Error('testMailbox must be an email address');
  const local = base.slice(0, at);
  const domain = base.slice(at + 1);
  const address = (name: string): string =>
    local.includes('+') ? `${local}-${name.replace(/^dev-/, '')}@${domain}` : `${local}+${name}@${domain}`;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  if (counts.coaches > letters.length) throw new Error('at most 26 test coaches');
  const coaches = Array.from({ length: counts.coaches }, (_, i) => `dev-coach-${letters[i]}`);
  const clients = Array.from({ length: counts.clients }, (_, i) => `dev-client-${i + 1}`);
  return [
    ...coaches.map((name) => ({ name, email: address(name), group: 'Coach' as const })),
    ...clients.map((name) => ({ name, email: address(name), group: 'Client' as const })),
  ];
}

export function mailboxDomain(base: string): string {
  return base.slice(base.lastIndexOf('@') + 1);
}

// Runs on the Node.js runtime's own AWS SDK. Create and Update make every listed account exist,
// verified, with the shared password and its group; Delete removes them.
const HANDLER = `
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const idp = new CognitoIdentityProviderClient({});
const sm = new SecretsManagerClient({});
exports.handler = async (event) => {
  const { UserPoolId, SecretArn, Accounts } = event.ResourceProperties;
  const accounts = JSON.parse(Accounts);
  if (event.RequestType === 'Delete') {
    for (const a of accounts) {
      try { await idp.send(new AdminDeleteUserCommand({ UserPoolId, Username: a.email })); }
      catch (e) { if (e.name !== 'UserNotFoundException') throw e; }
    }
    return { PhysicalResourceId: event.PhysicalResourceId };
  }
  const password = (await sm.send(new GetSecretValueCommand({ SecretId: SecretArn }))).SecretString;
  for (const a of accounts) {
    try {
      await idp.send(new AdminCreateUserCommand({ UserPoolId, Username: a.email, MessageAction: 'SUPPRESS',
        UserAttributes: [{ Name: 'email', Value: a.email }, { Name: 'email_verified', Value: 'true' }] }));
    } catch (e) { if (e.name !== 'UsernameExistsException') throw e; }
    await idp.send(new AdminSetUserPasswordCommand({ UserPoolId, Username: a.email, Password: password, Permanent: true }));
    await idp.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: a.email, GroupName: a.group }));
  }
  return { PhysicalResourceId: 'test-accounts-' + UserPoolId };
};
`;

export interface TestAccountsProps {
  readonly userPool: cognito.IUserPool;
  readonly accounts: readonly TestAccount[];
}

export class TestAccounts extends Construct {
  readonly password: secrets.Secret;

  constructor(scope: Construct, id: string, props: TestAccountsProps) {
    super(scope, id);
    const stack = Stack.of(this);

    // Meets the user pool's policy: upper, lower, digit and symbol, well over 8 characters.
    this.password = new secrets.Secret(this, 'Password', {
      description: 'The shared password of dev\'s test accounts (ADR-027 d3).',
      generateSecretString: {
        passwordLength: 24,
        requireEachIncludedType: true,
        excludeCharacters: '"\'`\\/@ $&|;<>(){}[]',
      },
    });

    const logGroup = new logs.LogGroup(this, 'Logs', { retention: logs.RetentionDays.ONE_MONTH });
    const fn = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(HANDLER),
      timeout: Duration.minutes(2),
      logGroup,
    });
    this.password.grantRead(fn);
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminDeleteUser',
      ],
      resources: [props.userPool.userPoolArn],
    }));

    const provider = new cr.Provider(this, 'Provider', { onEventHandler: fn });
    new CustomResource(this, 'Accounts', {
      serviceToken: provider.serviceToken,
      properties: {
        UserPoolId: props.userPool.userPoolId,
        SecretArn: this.password.secretArn,
        // Addresses only; the password is read from Secrets Manager at deploy time.
        Accounts: JSON.stringify(props.accounts.map(({ email, group }) => ({ email, group }))),
      },
    });

    Validations.of(this.password).acknowledge({
      id: 'AwsSolutions-SMG4',
      reason: 'A dev-only test password with no real data behind it; a new account stack makes a new one.',
    });
    Validations.of(fn).acknowledge(
      {
        id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
        reason: 'AWSLambdaBasicExecutionRole only lets the deploy-time function write its own logs.',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Node.js 24, the newest runtime confirmed in Lambda; CDK also lists 26, not yet relied on. Runs only at deploy time.',
      },
    );
    Validations.of(provider).acknowledge(
      {
        id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
        reason: 'CDK\'s custom-resource framework function: basic execution role for its own logs.',
      },
      {
        id: `AwsSolutions-IAM5[Resource::<${stack.getLogicalId(fn.node.defaultChild as lambda.CfnFunction)}.Arn>:*]`,
        reason: 'CDK\'s custom-resource framework may invoke only its handler function and that function\'s versions.',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'CDK\'s custom-resource framework chooses its own Node.js runtime.',
      },
    );
  }
}
