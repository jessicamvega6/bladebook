/**
 * Where the coach website's home is (ruling I14; Batch 17c). Built, it's the root of the coach host (app.bladebook.org),
 * with rinkside at /rinkside/. Locally all three apps share one server, so it's /coach/. scripts/sites.mjs checks no
 * built page still links to /coach/.
 */
export const COACH_HOME = import.meta.env.DEV ? '/coach/' : '/';
