import { SEED_PREFIX } from '../lib/table.ts';

/**
 * The seed file's item count and hash, written by seed.ts and read by check-import.ts. Beside the import prefix, not in
 * it (`seed/current.manifest.json`), so the import never reads it as data.
 */
export const MANIFEST_KEY = `${SEED_PREFIX.replace(/\/$/, '')}.manifest.json`;
