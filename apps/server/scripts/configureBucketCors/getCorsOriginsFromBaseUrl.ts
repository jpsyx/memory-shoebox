import { VITE_DEV_ORIGIN } from "./printConsoleFallback/printConsoleFallback.constants.ts";

/**
 * The origins the browser uploads from: the instance's own, from
 * `public.base_url`, and Vite's in development.
 *
 * The development origin is added only when `NODE_ENV` explicitly names a
 * non-production environment (`Config.isKnownNonProduction`), which fails
 * closed: a real bucket whose environment nobody can identify does not start
 * accepting PUTs from `localhost`.
 *
 * @param options.baseUrl `public.base_url`, or undefined while it is unset.
 * @param options.isKnownNonProduction From the server's own config.
 * @returns Each origin once, the instance's first.
 */
export function getCorsOriginsFromBaseUrl(
  options: Readonly<{
    baseUrl: string | undefined;
    isKnownNonProduction: boolean;
  }>,
): string[] {
  const instanceOrigins =
    options.baseUrl === undefined ? [] : [new URL(options.baseUrl).origin];
  const developmentOrigins = options.isKnownNonProduction
    ? [VITE_DEV_ORIGIN]
    : [];
  return [...new Set([...instanceOrigins, ...developmentOrigins])];
}
