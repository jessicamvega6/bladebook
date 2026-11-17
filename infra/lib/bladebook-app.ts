// Builds every stack for each environment that has an account. Shared by bin/ and the tests.

import { App, Tags, Validations } from 'aws-cdk-lib';
import nag from 'cdk-nag';
import { AppStack } from './app-stack.ts';
import { resourcePrefix } from './config.ts';
import type { EnvConfig } from './config.ts';
import { DeployAccessStack } from './deploy-access-stack.ts';
import { IdentityStack } from './identity-stack.ts';

export interface EnvStacks {
  readonly identity: IdentityStack;
  readonly app: AppStack;
  readonly deployAccess: DeployAccessStack;
}

export function addEnvironment(app: App, cfg: EnvConfig): EnvStacks {
  const env = { account: cfg.account, region: cfg.region };
  const prefix = resourcePrefix(cfg);
  const identity = new IdentityStack(app, `${prefix}-identity`, { env, cfg });
  const appStack = new AppStack(app, `${prefix}-app`, { env, cfg, userPool: identity.userPool });
  const deployAccess = new DeployAccessStack(app, `${prefix}-deploy-access`, { env, cfg });
  for (const stack of [identity, appStack, deployAccess]) {
    Tags.of(stack).add('project', 'bladebook');
    Tags.of(stack).add('environment', cfg.envName);
  }
  return { identity, app: appStack, deployAccess };
}

/** cdk-nag's AWS Solutions rules run on every synth; a finding fails it (ADR-001 A4, ADR-032). */
export function addSecurityChecks(app: App): void {
  Validations.of(app).addPlugins(new nag.AwsSolutionsChecks(app));
}
