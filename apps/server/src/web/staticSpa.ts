import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import type { ApiError } from "@famgram/shared";

/** URL prefix reserved for the JSON API. Everything else belongs to the SPA. */
export const API_PREFIX = "/api";

/**
 * Serves the built web app from the same origin as the API.
 *
 * Famgram deploys as a single Fly.io app: Fastify answers `/api/*` itself and
 * hands every other path to the SPA. Sharing one origin means no CORS
 * configuration and no cross-site cookies, which is one less thing for a
 * self-hoster to get wrong.
 *
 * Any path that is not a real file falls back to `index.html` so TanStack
 * Router can resolve it client-side, while unknown `/api/*` paths still return
 * a JSON 404 instead of a page of HTML.
 *
 * When `distPath` does not exist the static handler is skipped entirely. That
 * is the normal case in development, where Vite serves the app and proxies
 * `/api` here, and in tests.
 *
 * @param app The Fastify instance.
 * @param options.distPath Directory holding the built web app.
 */
export async function registerStaticSpa(
  app: FastifyInstance,
  options: { distPath: string },
): Promise<void> {
  const hasBuiltApp = existsSync(join(options.distPath, "index.html"));

  if (hasBuiltApp) {
    await app.register(fastifyStatic, {
      root: options.distPath,
      wildcard: false,
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApiRequest = request.url.startsWith(`${API_PREFIX}/`);
    if (isApiRequest || !hasBuiltApp) {
      const body: ApiError = {
        error: "not_found",
        message: `Route ${request.method} ${request.url} not found`,
      };
      return reply.code(404).type("application/json").send(body);
    }
    return reply.sendFile("index.html");
  });
}
