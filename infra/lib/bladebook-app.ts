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

export function addEnvironment(app: App, given: EnvConfig): EnvStacks {
  const cfg = withWafOverride(app, given);
  const env = { account: cfg.account, region: cfg.region };
  const prefix = resourcePrefix(cfg);
  // ADR-027 (I15): the owner's test mailbox is a deploy-time setting, never in the repo.
  const testMailbox = app.node.tryGetContext('testMailbox') as string | undefined;
  const identity = new IdentityStack(app, `${prefix}-identity`, { env, cfg, ...(testMailbox ? { testMailbox } : {}) });
  const appStack = new AppStack(app, `${prefix}-app`, {
    env,
    cfg,
    userPool: identity.userPool,
    coachAppClient: identity.coachClient,
    familyAppClient: identity.familyClient,
    ...(identity.seedBucket ? { seedBucket: identity.seedBucket } : {}),
  });
  const deployAccess = new DeployAccessStack(app, `${prefix}-deploy-access`, { env, cfg });
  for (const stack of [identity, appStack, deployAccess]) {
    Tags.of(stack).add('project', 'bladebook');
    Tags.of(stack).add('environment', cfg.envName);
  }
  return { identity, app: appStack, deployAccess };
}

/**
 * ADR-MASTER §17: dev's firewall is off, and switched on to rehearse before launch and before releases that change the
 * API's routes or request shapes. `-c waf=block` (or `count`, or `off`) does that for one deploy. Production's firewall
 * is never off, so `off` is refused there.
 */
function withWafOverride(app: App, cfg: EnvConfig): EnvConfig {
  const waf = app.node.tryGetContext('waf') as string | undefined;
  if (waf === undefined) return cfg;
  if (waf === 'off') {
    if (cfg.retainData) throw new Error(`${cfg.envName}: the firewall is never off in production (ADR-MASTER §17)`);
    return { ...cfg, waf: { ...cfg.waf, enabled: false } };
  }
  if (waf !== 'block' && waf !== 'count') throw new Error(`waf must be block, count or off, not ${waf}`);
  return { ...cfg, waf: { enabled: true, mode: waf } };
}

/** cdk-nag's AWS Solutions rules run on every synth; a finding fails it (ADR-001 A4, ADR-032). */
export function addSecurityChecks(app: App): void {
  Validations.of(app).addPlugins(new nag.AwsSolutionsChecks(app));
}
