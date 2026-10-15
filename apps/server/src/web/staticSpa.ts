import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import type { ApiError } from "@memory-shoebox/shared";
import { z } from "zod";

/** URL prefix reserved for the JSON API. Everything else belongs to the SPA. */
export const API_PREFIX = "/api";

/** Vite's default assets directory and eight-character content hash. */
const HASHED_VITE_ASSET = /^assets\/[^/]+-[\w-]{8}\.[a-z0-9]+$/i;

function _getEmittedFilesFromDirectory(distPath: string): Set<string> {
  try {
    const relativePath = z.string().refine((filename) => {
      return (
        !filename.includes("\\") &&
        !filename.includes("\0") &&
        filename.split("/").every((segment) => {
          return segment !== "" && segment !== "." && segment !== "..";
        })
      );
    });
    return new Set(
      z
        .array(relativePath)
        .parse(
          JSON.parse(
            readFileSync(join(distPath, ".vite/static-assets.json"), "utf8"),
          ),
        ),
    );
  } catch {
    return new Set();
  }
}

function _registerStaticRevalidation(
  app: FastifyInstance,
  staticResponses: Readonly<WeakSet<object>>,
): void {
  app.addHook("onSend", async (request, reply, payload) => {
    const entityTag = reply.raw.getHeader("etag");
    const ifNoneMatch = request.headers["if-none-match"];
    if (
      !staticResponses.has(reply.raw) ||
      (reply.statusCode !== 200 && reply.statusCode !== 206) ||
      (request.method !== "GET" && request.method !== "HEAD") ||
      typeof entityTag !== "string" ||
      !ifNoneMatch
    ) {
      return payload;
    }
    const isUnchanged = ifNoneMatch.split(",").some((candidate) => {
      const trimmed = candidate.trim();
      return (
        trimmed === "*" ||
        trimmed.replace(/^W\//, "") === entityTag.replace(/^W\//, "")
      );
    });
    if (isUnchanged) {
      if (payload instanceof Readable) {
        payload.destroy();
      }
      reply.code(304);
      reply.removeHeader("content-length");
      reply.removeHeader("content-type");
      reply.removeHeader("content-range");
      return null;
    }
    return payload;
  });
}

async function _registerBuiltFiles(
  app: FastifyInstance,
  distPath: string,
): Promise<void> {
  const staticResponses = new WeakSet<object>();
  const emittedFiles = _getEmittedFilesFromDirectory(distPath);
  _registerStaticRevalidation(app, staticResponses);
  await app.register(fastifyStatic, {
    root: distPath,
    wildcard: false,
    preCompressed: true,
    cacheControl: false,
    etag: false,
    setHeaders: (response, filename, stat) => {
      staticResponses.add(response);
      const encoding = filename.endsWith(".br")
        ? "br"
        : filename.endsWith(".gz")
          ? "gzip"
          : "identity";
      const assetPath = relative(distPath, filename)
        .split(sep)
        .join("/")
        .replace(/\.(br|gz)$/, "");
      response.setHeader(
        "Cache-Control",
        emittedFiles.has(assetPath) && HASHED_VITE_ASSET.test(assetPath)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      response.setHeader("Vary", "Accept-Encoding");
      // The encoding token separates variants even when their file stats match.
      response.setHeader(
        "ETag",
        `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}-${encoding}"`,
      );
    },
  });
}

/**
 * Serves the built web app from the same origin as the API.
 *
 * Memory Shoebox deploys as a single Fly.io app: Fastify answers `/api/*` itself and
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
    await _registerBuiltFiles(app, options.distPath);
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
