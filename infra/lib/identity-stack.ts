// The account stack (ADR-028 d4): the Cognito user pool, its two groups, the two website app
// clients and, in dev, the test accounts and the seed file's bucket. Built before the application
// stack, and kept between dev builds (I16). The auth-post-confirmation trigger comes with the
// backend wiring (Batch 17b).

import { Annotations, CfnOutput, Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';
import { dataRemovalPolicy, resourcePrefix } from './config.ts';
import type { EnvConfig } from './config.ts';
import { mailboxDomain, TestAccounts, testAccounts } from './test-accounts.ts';

export interface IdentityStackProps extends StackProps {
  readonly cfg: EnvConfig;
  /**
   * The owner's test mailbox (ADR-027, I15): CDK context `testMailbox`, from a GitHub environment
   * variable or the owner's own ~/.cdk.json. Never written into the repo.
   */
  readonly testMailbox?: string;
}

export class IdentityStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly coachClient: cognito.UserPoolClient;
  readonly familyClient: cognito.UserPoolClient;
  readonly seedBucket?: s3.Bucket;
  readonly testAccounts?: TestAccounts;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);
    const { cfg } = props;
    const prefix = resourcePrefix(cfg);

    // One user pool (ADR-MASTER §2). The username is the login email (ADR-016).
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: prefix,
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      // A changed email isn't used until its owner confirms the code sent to it.
      keepOriginal: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      // The browser shows these rules; the pool enforces them (ADR-016).
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      // "MFA is available to coaches" (ADR-MASTER §2): optional, by authenticator app.
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Dev stays in the SES sandbox, which could only send to verified addresses, so dev's
      // codes go out through Cognito's own sender. Production's SES sender is chosen with its
      // sending domain (owner, 2026-11-16: decide later).
      email: cognito.UserPoolEmail.withCognito(),
      deletionProtection: cfg.retainData,
      removalPolicy: dataRemovalPolicy(cfg),
    });

    this.userPool.addGroup('CoachGroup', { groupName: 'Coach' });
    this.userPool.addGroup('ClientGroup', { groupName: 'Client' });

    // Both clients: public (no secret), SRP plus refresh only, no hosted pages, and no
    // "user doesn't exist" answers (ADR-023 d11, ADR-MASTER §2). The APIs check the ID
    // token's aud, so each website gets its own client.
    const clientDefaults = {
      generateSecret: false,
      authFlows: { userSrp: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      idTokenValidity: Duration.minutes(60),
      accessTokenValidity: Duration.minutes(60),
    };
    this.coachClient = this.userPool.addClient('CoachWebClient', {
      ...clientDefaults,
      userPoolClientName: 'coach-web',
      // ADR-MASTER §2: 4 hours on the coach website (rinkside included).
      refreshTokenValidity: Duration.hours(4),
    });
    this.familyClient = this.userPool.addClient('FamilyWebClient', {
      ...clientDefaults,
      userPoolClientName: 'family-web',
      // ADR-MASTER §2: 60 minutes on the family website.
      refreshTokenValidity: Duration.minutes(60),
    });

    Validations.of(this.userPool).acknowledge(
      {
        id: 'AwsSolutions-COG2',
        reason: 'MFA is offered, not required: "MFA is available to coaches" (ADR-MASTER §2). Families are not asked for it.',
      },
      {
        id: 'AwsSolutions-COG3',
        reason: 'Threat protection needs the Plus plan. The WAF (ADR-019) rate-limits sign-up and sign-in instead.',
      },
      {
        id: 'AwsSolutions-COG8',
        reason: 'The Plus plan is charged per user for threat protection, which ADR-019 covers with the WAF instead.',
      },
    );

    if (cfg.seedImport) {
      // ADR-028 (I18): the seed file's bucket. A table import reads its file when the table is
      // created, so the bucket comes first. Fake data only. Emptied and deleted with this stack.
      this.seedBucket = new s3.Bucket(this, 'SeedBucket', {
        encryption: s3.BucketEncryption.KMS_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        enforceSSL: true,
        versioned: false,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
      Validations.of(this.seedBucket).acknowledge({
        id: 'AwsSolutions-S1',
        reason: 'Holds only the generated seed file: fake data, rewritten by every seed (ADR-028).',
      });
      new CfnOutput(this, 'SeedBucketName', { value: this.seedBucket.bucketName });
    }

    if (cfg.testAccounts) {
      if (props.testMailbox) {
        const accounts = testAccounts(props.testMailbox, cfg.testAccounts);
        this.testAccounts = new TestAccounts(this, 'TestAccounts', { userPool: this.userPool, accounts });
        // ADR-027 (I15): dev's SES verifies the mailbox's domain once, so the sandbox accepts every
        // tagged address. Its DKIM records are added by hand on that domain (outputs below).
        const identity = new ses.EmailIdentity(this, 'TestMailboxDomain', {
          identity: ses.Identity.domain(mailboxDomain(props.testMailbox)),
        });
        identity.dkimRecords.forEach((r, i) => {
          new CfnOutput(this, `TestMailboxDkim${i + 1}`, { value: `${r.name} CNAME ${r.value}` });
        });
        new CfnOutput(this, 'TestAccountsPasswordSecret', { value: this.testAccounts.password.secretName });
      } else {
        Annotations.of(this).addWarning(
          'No test accounts: set the CDK context value testMailbox (the owner\'s test mailbox) to create them.',
        );
      }
    }

    // What the APIs and websites need: bladebook.auth.issuer and the two client IDs.
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'Issuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
    new CfnOutput(this, 'CoachAppClientId', { value: this.coachClient.userPoolClientId });
    new CfnOutput(this, 'FamilyAppClientId', { value: this.familyClient.userPoolClientId });
  }
}
