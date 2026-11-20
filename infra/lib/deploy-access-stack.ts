// How GitHub Actions reaches this account (ADR-032 decision 2): OpenID Connect only, no stored
// keys, a trust rule matching exactly one repository and GitHub environment, and a role that
// can do nothing but hand the deploy to CDK's bootstrap roles. It outlives dev's builds, so it
// is its own stack, deployed by hand, never by the workflow that uses it (.github/workflows/deploy.yml).

import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { resourcePrefix } from './config.ts';
import type { EnvConfig } from './config.ts';
import { dataDenyStatements } from './data-deny.ts';

export interface DeployAccessStackProps extends StackProps {
  readonly cfg: EnvConfig;
}

const GITHUB_ISSUER = 'token.actions.githubusercontent.com';

/** The bootstrap roles a deploy needs, from those `cdk bootstrap` makes with its default qualifier. No Docker images, so no image-publishing; no lookups (I13). */
export function bootstrapRoleArns(account: string, region: string): string[] {
  return ['deploy', 'file-publishing'].map(
    (kind) => `arn:aws:iam::${account}:role/cdk-hnb659fds-${kind}-role-${account}-${region}`,
  );
}

export class DeployAccessStack extends Stack {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: DeployAccessStackProps) {
    super(scope, id, props);
    const { cfg } = props;

    const provider = new iam.OidcProviderNative(this, 'GitHubOidc', {
      url: `https://${GITHUB_ISSUER}`,
      clientIds: ['sts.amazonaws.com'],
    });

    this.role = new iam.Role(this, 'DeployRole', {
      roleName: `${resourcePrefix(cfg)}-github-deploy`,
      description: `GitHub Actions deploys for ${cfg.github.repo}, environment ${cfg.github.environment}`,
      maxSessionDuration: Duration.hours(1),
      // Exact matches, no wildcards (ADR-032 d2).
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_ISSUER}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_ISSUER}:sub`]: `repo:${cfg.github.repo}:environment:${cfg.github.environment}`,
        },
      }),
    });
    // Only CDK's deploy and file-publishing roles. Not the lookup role, whose ReadOnlyAccess reads table items
    // and logs: lookups are committed in cdk.context.json (I13). What CloudFormation may then do is set by the
    // bootstrap execution policy: AdministratorAccess with the data denies (infra/bootstrap/bootstrap.ts).
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        resources: bootstrapRoleArns(this.account, this.region),
      }),
    );
    // The same denies here, as a second layer (ADR-032, I13).
    for (const s of dataDenyStatements(cfg)) this.role.addToPolicy(iam.PolicyStatement.fromJson(s));

    new CfnOutput(this, 'DeployRoleArn', { value: this.role.roleArn });
  }
}
