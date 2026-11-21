/**
 * What the sign-in forms need: the region, the user pool and this website's own app client (ADR-023 d9, d11). CI builds
 * one copy of the websites for every environment, so these aren't built in: the stack uploads each website's
 * `config.json` (infra/lib/website.ts, `siteConfig`). Locally, the Vite dev server serves dev's, from the file infra's
 * `dev-pool` script writes (ruling I31). Nothing here is secret.
 */
export interface SignInConfig {
  region: string;
  userPoolId: string;
  appClientId: string;
}

export type Site = 'coach' | 'family';

/** Built, each website's config is at its host's root (the rinkside page uses the coach website's). Locally, /coach/ or /family/. */
export function configUrl(site: Site): string {
  return import.meta.env.DEV ? `/${site}/config.json` : '/config.json';
}

export async function loadConfig(site: Site): Promise<SignInConfig> {
  const res = await fetch(configUrl(site), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(import.meta.env.DEV
      ? 'Sign-in isn’t set up on this computer. Run `npm --prefix infra run dev-pool`, then restart `npm run dev`.'
      : 'Can’t reach BladeBook. Check your connection and try again.');
  }
  const c = (await res.json()) as Partial<SignInConfig>;
  if (!c.region || !c.userPoolId || !c.appClientId) throw new Error('Sign-in isn’t set up for this website.');
  return { region: c.region, userPoolId: c.userPoolId, appClientId: c.appClientId };
}
