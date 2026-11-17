// Every value that differs between dev and production lives here, so the stacks never test
// the environment name themselves (ADR-027 d1: dev is built from the same code as production).
// The product name and the domain are configuration, not code (Open-Pending §1).

import { RemovalPolicy } from 'aws-cdk-lib';

export type EnvName = 'dev' | 'prod';

export interface SiteConfig {
  /** Full host name the site is served on. */
  readonly host: string;
  /** The Route 53 zone the host's records go in. */
  readonly zoneName: string;
  /**
   * The zone's ID. When unset, CDK looks the zone up by name at synth time (needs an AWS
   * sign-in) and caches the answer in cdk.context.json.
   */
  readonly zoneId?: string;
  /**
   * Folders that are separate single-page apps, longest first, each ending in '/'.
   * A request for a path with no file extension is served that folder's index.html.
   */
  readonly appRoots: readonly string[];
}

export interface EnvConfig {
  readonly envName: EnvName;
  /** Empty until the account exists; stacks for an environment without one aren't built. */
  readonly account: string;
  readonly region: string;
  readonly productName: string;
  readonly sites: { readonly coach: SiteConfig; readonly family: SiteConfig };
  /**
   * The domain SES sends from, verified in the zone of the same name. Undefined while
   * undecided (production's sending domain: owner, 2026-11-16, decide later).
   */
  readonly emailDomain?: { readonly name: string; readonly zoneId?: string };
  /** Production keeps its data when a stack is deleted; dev's teardown deletes everything (ADR-027 d4). */
  readonly retainData: boolean;
  /** Ask search engines not to index the sites (ADR-027: dev is not indexed). */
  readonly noindex: boolean;
  /** ADR-019 / ADR-MASTER §17: wafEnabled (off deletes the ACL) and wafMode. */
  readonly waf: { readonly enabled: boolean; readonly mode: 'count' | 'block' };
  /** ADR-032 d2: the deploy role trusts exactly this repository and GitHub environment. */
  readonly github: { readonly repo: string; readonly environment: string };
}

const productName = 'BladeBook';
const githubRepo = 'jessicamvega6/bladebook';

export const dev: EnvConfig = {
  envName: 'dev',
  account: '793581837527', // bladebook-dev
  region: 'us-east-1',
  productName,
  // Owner, 2026-11-16: production is app.bladebook.org (coach) and family.bladebook.org
  // (family); dev mirrors them inside the dev.bladebook.org zone, delegated from Cloudflare.
  sites: {
    coach: { host: 'app.dev.bladebook.org', zoneName: 'dev.bladebook.org', appRoots: ['/rinkside/', '/'] },
    family: { host: 'family.dev.bladebook.org', zoneName: 'dev.bladebook.org', appRoots: ['/'] },
  },
  // Dev never leaves the SES sandbox (ADR-MASTER §19).
  emailDomain: { name: 'dev.bladebook.org' },
  retainData: false,
  noindex: true,
  // ADR-MASTER §17: off in dev by default; turned on in block mode to rehearse.
  waf: { enabled: false, mode: 'block' },
  github: { repo: githubRepo, environment: 'dev' },
};

export const prod: EnvConfig = {
  envName: 'prod',
  account: '', // not created yet
  region: 'us-east-1',
  productName,
  // Each is its own subdomain delegated from Cloudflare to a zone in the production account.
  sites: {
    coach: { host: 'app.bladebook.org', zoneName: 'app.bladebook.org', appRoots: ['/rinkside/', '/'] },
    family: { host: 'family.bladebook.org', zoneName: 'family.bladebook.org', appRoots: ['/'] },
  },
  emailDomain: undefined,
  retainData: true,
  noindex: false,
  // ADR-MASTER §17: count mode for the first two weeks, then block.
  waf: { enabled: true, mode: 'count' },
  github: { repo: githubRepo, environment: 'production' },
};

export const environments: readonly EnvConfig[] = [dev, prod];

/** The one place the environment decides whether data survives a stack deletion. */
export function dataRemovalPolicy(cfg: EnvConfig): RemovalPolicy {
  return cfg.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
}

/** Prefix for physical resource names: names carry the environment (ADR-011). */
export function resourcePrefix(cfg: EnvConfig): string {
  return `bladebook-${cfg.envName}`;
}
