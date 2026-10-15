import negotiate from "@fastify/accept-negotiator";
import fastifyStatic from "@fastify/static";
import type { ApiError } from "@memory-shoebox/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { existsSync, readFileSync, type Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";

/** URL prefix reserved for the JSON API. Everything else belongs to the SPA. */
export const API_PREFIX = "/api";

/** Vite's default assets directory and eight-character content hash. */
const HASHED_VITE_ASSET = /^assets\/[^/]+-[\w-]{8}\.[a-z0-9]+$/i;

type StaticFile = { filename: string; stat: Stats };
type StaticBuild = { distPath: string; emittedFiles: ReadonlySet<string> };
type StaticHeaders = {
  "Cache-Control": string;
  Vary: string;
  ETag: string;
  "Last-Modified": string;
};

const ENCODING_EXTENSIONS: Record<string, string | undefined> = {
  br: ".br",
  gzip: ".gz",
};

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

function _getStaticHeadersFromFile(
  options: Readonly<StaticFile & StaticBuild>,
): StaticHeaders {
  const encoding = options.filename.endsWith(".br")
    ? "br"
    : options.filename.endsWith(".gz")
      ? "gzip"
      : "identity";
  const assetPath = relative(options.distPath, options.filename)
    .split(sep)
    .join("/")
    .replace(/\.(br|gz)$/, "");
  return {
    "Cache-Control":
      options.emittedFiles.has(assetPath) && HASHED_VITE_ASSET.test(assetPath)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    Vary: "Accept-Encoding",
    ETag: `W/"${options.stat.size.toString(16)}-${options.stat.mtimeMs.toString(16)}-${encoding}"`,
    "Last-Modified": options.stat.mtime.toUTCString(),
  };
}

function _isMatchingEntityTag(
  options: Readonly<{ ifNoneMatch: string; entityTag: string }>,
): boolean {
  return options.ifNoneMatch.split(",").some((candidate) => {
    const trimmed = candidate.trim();
    return (
      trimmed === "*" ||
      trimmed.replace(/^W\//, "") === options.entityTag.replace(/^W\//, "")
    );
  });
}

async function _getStaticFileFromEncoding(
  options: Readonly<{
    filename: string;
    acceptEncoding: string;
    encodings: readonly string[];
  }>,
): Promise<StaticFile | undefined> {
  const encoding = negotiate(options.acceptEncoding, [...options.encodings]);
  const filename = encoding
    ? `${options.filename}${ENCODING_EXTENSIONS[encoding]}`
    : options.filename;
  try {
    const fileStat = await stat(filename);
    return fileStat.isFile() ? { filename, stat: fileStat } : undefined;
  } catch (error) {
    if (
      encoding &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return _getStaticFileFromEncoding({
        ...options,
        encodings: options.encodings.filter((candidate) => {
          return candidate !== encoding;
        }),
      });
    }
    return undefined;
  }
}

function _hasEarlierFailedPrecondition(
  options: Readonly<{ request: FastifyRequest; file: StaticFile }>,
): boolean {
  const ifMatch = options.request.headers["if-match"];
  if (ifMatch && ifMatch !== "*") {
    // The plugin has ETag disabled, so specific If-Match values fail there.
    return true;
  }
  const ifUnmodifiedSince = options.request.headers["if-unmodified-since"];
  return Boolean(
    ifUnmodifiedSince &&
    Date.parse(options.file.stat.mtime.toUTCString()) >
      Date.parse(ifUnmodifiedSince),
  );
}

async function _sendConditionalRangeRevalidation(
  options: Readonly<
    StaticBuild & {
      request: FastifyRequest;
      reply: FastifyReply;
      filename: string;
    }
  >,
): Promise<boolean> {
  const ifNoneMatch = options.request.headers["if-none-match"];
  if (
    !options.request.headers.range ||
    !ifNoneMatch ||
    (options.request.method !== "GET" && options.request.method !== "HEAD")
  ) {
    return false;
  }
  const file = await _getStaticFileFromEncoding({
    filename: options.filename,
    acceptEncoding: (options.request.headers["accept-encoding"] ?? "")
      .toLowerCase()
      .replace(/\*/g, "gzip"),
    encodings: ["br", "gzip", "deflate"],
  });
  if (
    !file ||
    _hasEarlierFailedPrecondition({ request: options.request, file })
  ) {
    return false;
  }
  const headers = _getStaticHeadersFromFile({ ...options, ...file });
  if (!_isMatchingEntityTag({ ifNoneMatch, entityTag: headers.ETag })) {
    return false;
  }
  options.reply.headers(headers).code(304).send();
  return true;
}

function _registerStaticRangePreconditions(
  options: Readonly<StaticBuild & { app: FastifyInstance }>,
): void {
  options.app.addHook("preHandler", async (request, reply) => {
    const config = request.routeOptions.config;
    if (
      "file" in config &&
      typeof config.file === "string" &&
      "rootPath" in config &&
      typeof config.rootPath === "string" &&
      relative(options.distPath, config.rootPath) === ""
    ) {
      const pathname = config.file.endsWith("/")
        ? `${config.file}index.html`
        : config.file;
      const hasRevalidated = await _sendConditionalRangeRevalidation({
        ...options,
        request,
        reply,
        filename: join(options.distPath, pathname),
      });
      if (hasRevalidated) {
        return reply;
      }
    }
  });
}

function _registerStaticRevalidation({
  app,
  staticResponses,
}: Readonly<{
  app: FastifyInstance;
  staticResponses: Readonly<WeakSet<object>>;
}>): void {
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
    const isUnchanged = _isMatchingEntityTag({ ifNoneMatch, entityTag });
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

async function _registerBuiltFiles({
  app,
  distPath,
}: Readonly<{ app: FastifyInstance; distPath: string }>): Promise<Set<string>> {
  const staticResponses = new WeakSet<object>();
  const emittedFiles = _getEmittedFilesFromDirectory(distPath);
  _registerStaticRevalidation({ app, staticResponses });
  _registerStaticRangePreconditions({ app, distPath, emittedFiles });
  await app.register(fastifyStatic, {
    root: distPath,
    wildcard: false,
    preCompressed: true,
    cacheControl: false,
    etag: false,
    setHeaders: (response, filename, fileStat) => {
      staticResponses.add(response);
      Object.entries(
        _getStaticHeadersFromFile({
          filename,
          stat: fileStat,
          distPath,
          emittedFiles,
        }),
      ).forEach(([name, value]) => {
        response.setHeader(name, value);
      });
    },
  });
  return emittedFiles;
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

  const emittedFiles = hasBuiltApp
    ? await _registerBuiltFiles({ app, distPath: options.distPath })
    : new Set<string>();

  app.setNotFoundHandler(async (request, reply) => {
    const isApiRequest = request.url.startsWith(`${API_PREFIX}/`);
    if (isApiRequest || !hasBuiltApp) {
      const body: ApiError = {
        error: "not_found",
        message: `Route ${request.method} ${request.url} not found`,
      };
      return reply.code(404).type("application/json").send(body);
    }
    const hasRevalidated = await _sendConditionalRangeRevalidation({
      request,
      reply,
      filename: join(options.distPath, "index.html"),
      distPath: options.distPath,
      emittedFiles,
    });
    if (hasRevalidated) {
      return reply;
    }
    return reply.sendFile("index.html");
  });
}
