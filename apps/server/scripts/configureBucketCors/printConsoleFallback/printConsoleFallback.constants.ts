/**
 * Where `pnpm dev` serves the web app, and so where a development upload's
 * PUTs come from. `apps/web/vite.config.ts` pins the port.
 */
export const VITE_DEV_ORIGIN = "http://localhost:5173";

/**
 * The rule's name in Backblaze's own format, so the console says what it is
 * for. Six to fifty letters, digits and hyphens, as Backblaze requires.
 */
export const CORS_RULE_NAME = "memory-shoebox-uploads";

/** How long a browser may cache the preflight answer. */
export const CORS_MAX_AGE_SECONDS = 3600;

/** The one line printed whenever the arguments do not make sense. */
export const BUCKET_CORS_USAGE = "Usage: pnpm b2:cors [--apply]";
