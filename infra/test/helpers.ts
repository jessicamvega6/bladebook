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
export const testProd = withTestZones(prod);

export interface Built {
  readonly stacks: EnvStacks;
  readonly identity: Template;
  readonly app: Template;
  readonly deployAccess: Template;
}

export function build(cfg: EnvConfig): Built {
  const app = new App();
  const stacks = addEnvironment(app, cfg);
  return {
    stacks,
    identity: Template.fromStack(stacks.identity),
    app: Template.fromStack(stacks.app),
    deployAccess: Template.fromStack(stacks.deployAccess),
  };
}

/** Synthesizes with cdk-nag on and returns the error, if any. */
export function synthWithSecurityChecks(cfgs: readonly EnvConfig[]): Error | undefined {
  const app = new App();
  for (const cfg of cfgs) addEnvironment(app, cfg);
  addSecurityChecks(app);
  try {
    app.synth();
    return undefined;
  } catch (e) {
    return e as Error;
  }
}
