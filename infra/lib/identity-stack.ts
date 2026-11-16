// The account stack (ADR-028 d4): the Cognito user pool, its two groups and the two website
// app clients. Built before the application stack. The auth-post-confirmation trigger and the
// dev test accounts come with the backend wiring and the seed (Batch 17b).

import { CfnOutput, Duration, Stack, Validations } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import { dataRemovalPolicy, resourcePrefix } from './config.ts';
import type { EnvConfig } from './config.ts';

export interface IdentityStackProps extends StackProps {
  readonly cfg: EnvConfig;
}

export class IdentityStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly coachClient: cognito.UserPoolClient;
  readonly familyClient: cognito.UserPoolClient;

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

    // What the APIs and websites need: bladebook.auth.issuer and the two client IDs.
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'Issuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
    new CfnOutput(this, 'CoachAppClientId', { value: this.coachClient.userPoolClientId });
    new CfnOutput(this, 'FamilyAppClientId', { value: this.familyClient.userPoolClientId });
  }
}
