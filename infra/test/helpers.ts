import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { addEnvironment, addSecurityChecks } from '../lib/bladebook-app.ts';
import type { EnvStacks } from '../lib/bladebook-app.ts';
import { dev, prod } from '../lib/config.ts';
import type { EnvConfig } from '../lib/config.ts';

/** Zone IDs stand in for the lookups, which would need an AWS sign-in. */
export function withTestZones(cfg: EnvConfig): EnvConfig {
  return {
    ...cfg,
    account: cfg.account || '111111111111',
    sites: {
      coach: { ...cfg.sites.coach, zoneId: 'ZCOACHTEST' },
      family: { ...cfg.sites.family, zoneId: cfg.sites.family.zoneName === cfg.sites.coach.zoneName ? 'ZCOACHTEST' : 'ZFAMILYTEST' },
    },
    ...(cfg.emailDomain ? { emailDomain: { ...cfg.emailDomain, zoneId: 'ZCOACHTEST' } } : {}),
  };
}

export const testDev = withTestZones(dev);
/** Production's email domain is set in Batch 29; until then the tests stand one in, as production can't build without it. */
export const testProd = withTestZones({ ...prod, emailDomain: prod.emailDomain ?? { name: 'bladebook.org' } });

export interface Built {
  readonly stacks: EnvStacks;
  readonly identity: Template;
  readonly app: Template;
  readonly deployAccess: Template;
}

/** A stand-in for the owner's test mailbox, which is never in the repo. */
export const TEST_MAILBOX = 'owner+dev@mailbox.test';

export function build(cfg: EnvConfig, context: Record<string, string> = {}): Built {
  const app = new App({ context: { 'bladebook:placeholderCode': 'true', ...context } });
  const stacks = addEnvironment(app, cfg);
  return {
    stacks,
    identity: Template.fromStack(stacks.identity),
    app: Template.fromStack(stacks.app),
    deployAccess: Template.fromStack(stacks.deployAccess),
  };
}

/** Synthesizes with cdk-nag on and returns the error, if any. */
export function synthWithSecurityChecks(cfgs: readonly EnvConfig[], context: Record<string, string> = {}): Error | undefined {
  const app = new App({ context: { 'bladebook:placeholderCode': 'true', ...context } });
  for (const cfg of cfgs) addEnvironment(app, cfg);
  addSecurityChecks(app);
  try {
    app.synth();
    return undefined;
  } catch (e) {
    return e as Error;
  }
}
