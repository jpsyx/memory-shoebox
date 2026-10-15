import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  brotliCompressSync,
  brotliDecompressSync,
  gzipSync,
  gunzipSync,
} from "node:zlib";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerStaticSpa } from "../../src/web/staticSpa.ts";

const HTML = `<html><body>${"family memories ".repeat(200)}</body></html>`;
const JAVASCRIPT = `console.log(${JSON.stringify("family memories ".repeat(200))});`;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const SERVERS: FastifyInstance[] = [];
let directory: string;
let app: FastifyInstance;

async function _makeServerFromDirectory(
  distPath: string,
): Promise<FastifyInstance> {
  const server = Fastify();
  SERVERS.push(server);
  await registerStaticSpa(server, { distPath });
  return server;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "shoebox-static-"));
  await mkdir(join(directory, "assets"));
  await mkdir(join(directory, ".vite"));
  await writeFile(
    join(directory, ".vite/static-assets.json"),
    JSON.stringify(["index.html", "assets/main-Da_0-abc.js"]),
  );
  await Promise.all(
    [
      ["index.html", HTML],
      ["assets/main-Da_0-abc.js", JAVASCRIPT],
      ["family-logo.svg", "<svg/>"],
      ["assets/family-logo.svg", "<svg/>"],
      ["assets/family-portrait.jpg", "media bytes"],
    ].map(async ([filename, contents]) => {
      await writeFile(join(directory, filename!), contents!);
      if (filename!.endsWith(".html") || filename!.endsWith(".js")) {
        await writeFile(join(directory, `${filename}.gz`), gzipSync(contents!));
        await writeFile(
          join(directory, `${filename}.br`),
          brotliCompressSync(contents!),
        );
      }
    }),
  );
  app = await _makeServerFromDirectory(directory);
});

afterEach(async () => {
  await Promise.all(
    SERVERS.splice(0).map((server) => {
      return server.close();
    }),
  );
  await rm(directory, { recursive: true, force: true });
});

it("negotiates compressed hashed assets and revalidates HTML", async () => {
  const validators = new Set<string>();
  await Promise.all(
    ["identity", "gzip", "br"].map(async (encoding) => {
      const asset = await app.inject({
        url: "/assets/main-Da_0-abc.js",
        headers: { "accept-encoding": encoding },
      });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
      expect(asset.headers.vary).toBe("Accept-Encoding");
      expect(asset.headers["content-type"]).toMatch(/^application\/javascript/);
      expect(Number(asset.headers["content-length"])).toBe(
        asset.rawPayload.byteLength,
      );
      expect(asset.headers["content-encoding"]).toBe(
        encoding === "identity" ? undefined : encoding,
      );
      const decoded =
        encoding === "br"
          ? brotliDecompressSync(asset.rawPayload)
          : encoding === "gzip"
            ? gunzipSync(asset.rawPayload)
            : asset.rawPayload;
      expect(decoded.toString()).toBe(JAVASCRIPT);
      validators.add(String(asset.headers.etag));
      const unchanged = await app.inject({
        url: "/assets/main-Da_0-abc.js",
        headers: {
          "accept-encoding": encoding,
          "if-none-match": String(asset.headers.etag),
        },
      });
      expect(unchanged.statusCode).toBe(304);
      expect(unchanged.rawPayload.byteLength).toBe(0);
      expect(unchanged.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
      expect(unchanged.headers.vary).toBe("Accept-Encoding");
      const otherEncoding = encoding === "identity" ? "gzip" : "identity";
      const otherVariant = await app.inject({
        url: "/assets/main-Da_0-abc.js",
        headers: {
          "accept-encoding": otherEncoding,
          "if-none-match": String(asset.headers.etag),
        },
      });
      expect(otherVariant.statusCode).toBe(200);
      await Promise.all(
        ["/index.html", "/", "/items/deep-link"].map(async (url) => {
          const html = await app.inject({
            url,
            headers: { "accept-encoding": encoding },
          });
          expect(html.headers["cache-control"]).toBe("no-cache");
          expect(html.headers["content-type"]).toMatch(/^text\/html/);
          expect(html.headers.vary).toBe("Accept-Encoding");
          expect(Number(html.headers["content-length"])).toBe(
            html.rawPayload.byteLength,
          );
          const decodedHtml =
            encoding === "br"
              ? brotliDecompressSync(html.rawPayload)
              : encoding === "gzip"
                ? gunzipSync(html.rawPayload)
                : html.rawPayload;
          expect(decodedHtml.toString()).toBe(HTML);
          const revalidated = await app.inject({
            url,
            headers: {
              "accept-encoding": encoding,
              "if-none-match": String(html.headers.etag),
            },
          });
          expect(revalidated.statusCode).toBe(304);
          expect(revalidated.body).toBe("");
          expect(revalidated.headers["cache-control"]).toBe("no-cache");
        }),
      );
    }),
  );
  expect(validators.size).toBe(3);
});

it.each([
  undefined,
  "identity",
  "zstd",
  "gzip;q=0, br;q=0",
  "br;q=0, gzip;q=1",
])(
  "falls back or negotiates accepted encodings: %s",
  async (acceptEncoding) => {
    const response = await app.inject({
      url: "/assets/main-Da_0-abc.js",
      headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe(
      acceptEncoding === "br;q=0, gzip;q=1" ? "gzip" : undefined,
    );
    expect(response.headers.vary).toBe("Accept-Encoding");
  },
);

it("separates validators even when representation size and modification time collide", async () => {
  const timestamp = new Date("2026-01-01T00:00:00Z");
  const original = Buffer.from("x".repeat(200));
  await Promise.all(
    ["", ".gz", ".br"].map(async (suffix) => {
      const filename = join(directory, `assets/collision-Ab_cd-12.js${suffix}`);
      const compressed =
        suffix === ".br"
          ? brotliCompressSync(original)
          : suffix === ".gz"
            ? gzipSync(original)
            : original;
      await writeFile(
        filename,
        Buffer.concat([
          compressed,
          Buffer.alloc(original.byteLength - compressed.byteLength),
        ]),
      );
      await utimes(filename, timestamp, timestamp);
    }),
  );
  const collisionApp = await _makeServerFromDirectory(directory);
  await Promise.all(
    ["identity", "gzip", "br"].map(async (encoding) => {
      const representation = await collisionApp.inject({
        url: "/assets/collision-Ab_cd-12.js",
        headers: { "accept-encoding": encoding },
      });
      const decoded =
        encoding === "br"
          ? brotliDecompressSync(representation.rawPayload)
          : encoding === "gzip"
            ? gunzipSync(representation.rawPayload)
            : representation.rawPayload;
      expect(decoded).toEqual(original);
      await Promise.all(
        ["identity", "gzip", "br"]
          .filter((otherEncoding) => {
            return otherEncoding !== encoding;
          })
          .map(async (otherEncoding) => {
            const otherVariant = await collisionApp.inject({
              url: "/assets/collision-Ab_cd-12.js",
              headers: {
                "accept-encoding": otherEncoding,
                "if-none-match": String(representation.headers.etag),
              },
            });
            expect(otherVariant.statusCode).toBe(200);
            expect(otherVariant.headers.etag).not.toBe(
              representation.headers.etag,
            );
          }),
      );
    }),
  );
});

it("honors GET/HEAD weak and list validators with precedence over modification time", async () => {
  const original = await app.inject("/assets/main-Da_0-abc.js");
  const strongTag = String(original.headers.etag).replace(/^W\//, "");
  await Promise.all(
    ["GET", "HEAD"].flatMap((method) => {
      return ["*", strongTag, `"other", ${strongTag}`].map(
        async (validator) => {
          const response = await app.inject({
            method: method as "GET" | "HEAD",
            url: "/assets/main-Da_0-abc.js",
            headers: { "if-none-match": validator },
          });
          expect(response.statusCode).toBe(304);
          expect(response.body).toBe("");
          expect(response.headers["content-length"]).toBeUndefined();
        },
      );
    }),
  );
  const nonmatching = await app.inject({
    url: "/assets/main-Da_0-abc.js",
    headers: {
      "if-none-match": '"other"',
      "if-modified-since": "Fri, 01 Jan 2100 00:00:00 GMT",
    },
  });
  expect(nonmatching.statusCode).toBe(200);
  const modifiedSinceOnly = await app.inject({
    url: "/assets/main-Da_0-abc.js",
    headers: { "if-modified-since": String(original.headers["last-modified"]) },
  });
  expect(modifiedSinceOnly.statusCode).toBe(304);
});

it("closes discarded static file streams without reading their bodies and leaves API validators alone", async () => {
  const observedStreams: Readable[] = [];
  const lifecycleApp = Fastify();
  SERVERS.push(lifecycleApp);
  lifecycleApp.addHook("onSend", async (request, _reply, payload) => {
    if (request.headers["if-none-match"] && payload instanceof Readable) {
      observedStreams.push(payload);
    }
    return payload;
  });
  lifecycleApp.get("/api/custom-validator", (_request, reply) => {
    reply.raw.setHeader("ETag", 'W/"api-validator"');
    return reply.send("api body");
  });
  await registerStaticSpa(lifecycleApp, { distPath: directory });
  const initial = await lifecycleApp.inject("/assets/main-Da_0-abc.js");
  await Promise.all(
    Array.from({ length: 25 }, async () => {
      const response = await lifecycleApp.inject({
        url: "/assets/main-Da_0-abc.js",
        headers: { "if-none-match": String(initial.headers.etag) },
      });
      expect(response.statusCode).toBe(304);
      expect(response.rawPayload.byteLength).toBe(0);
    }),
  );
  expect(observedStreams).toHaveLength(25);
  await Promise.all(
    observedStreams.map(async (stream) => {
      if (!stream.closed) {
        await new Promise<void>((finish) => {
          return stream.once("close", finish);
        });
      }
      expect(stream.destroyed).toBe(true);
      expect(stream.readableDidRead).toBe(false);
    }),
  );
  const api = await lifecycleApp.inject({
    url: "/api/custom-validator",
    headers: { "if-none-match": 'W/"api-validator"' },
  });
  expect(api.statusCode).toBe(200);
  expect(api.body).toBe("api body");
});

it("revalidates public assets and preserves media, missing-file and API behavior", async () => {
  await Promise.all(
    [
      "/family-logo.svg",
      "/assets/family-logo.svg",
      "/assets/family-portrait.jpg",
    ].map(async (url) => {
      const response = await app.inject({
        url,
        headers: { "accept-encoding": "br, gzip" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["content-encoding"]).toBeUndefined();
    }),
  );
  const missing = await app.inject("/assets/missing.js");
  expect(missing.statusCode).toBe(200);
  expect(missing.body).toBe(HTML);
  expect(missing.headers["cache-control"]).toBe("no-cache");
  const api = await app.inject("/api/missing");
  expect(api.statusCode).toBe(404);
  expect(api.json()).toEqual({
    error: "not_found",
    message: "Route GET /api/missing not found",
  });
  const unbuilt = await _makeServerFromDirectory(join(directory, "unbuilt"));
  expect((await unbuilt.inject("/items/deep-link")).statusCode).toBe(404);
});

it.each([
  undefined,
  "{broken",
  '{"files":[]}',
  '["assets/main-Da_0-abc.js",3]',
  '["assets/main-Da_0-abc.js","../outside.js"]',
])(
  "fails closed to revalidation for an absent or malformed emitted-file inventory: %s",
  async (inventory) => {
    const inventoryPath = join(directory, ".vite/static-assets.json");
    if (inventory === undefined) {
      await rm(inventoryPath);
    } else {
      await writeFile(inventoryPath, inventory);
    }
    const invalidInventoryApp = await _makeServerFromDirectory(directory);
    const response = await invalidInventoryApp.inject(
      "/assets/main-Da_0-abc.js",
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JAVASCRIPT);
    expect(response.headers["cache-control"]).toBe("no-cache");
  },
);

describe.skipIf(!process.env.STATIC_SPA_BUILT_OUTPUT)(
  "real built output",
  () => {
    it("serves matching compressed entry and worker artifacts with representation validators", async () => {
      const distPath = join(import.meta.dirname, "../../../web/dist");
      const built = await _makeServerFromDirectory(distPath);
      const filenames = await readdir(join(distPath, "assets"));
      const entry = filenames.find((filename) => {
        return /^main-[\w-]{8}\.js$/.test(filename);
      });
      const worker = filenames.find((filename) => {
        return /^mediaWorker-[\w-]{8}\.js$/.test(filename);
      });
      const heicHelper = filenames.find((filename) => {
        return /^makeImageDataFromHeic-[\w-]{8}\.js$/.test(filename);
      });
      const css = filenames.find((filename) => {
        return /^main-[\w-]{8}\.css$/.test(filename);
      });
      expect(entry).toBeDefined();
      expect(worker).toBeDefined();
      expect(heicHelper).toBeDefined();
      expect(css).toBeDefined();
      const originalAssets = filenames.filter((filename) => {
        return !/\.(br|gz)$/.test(filename);
      });
      const inventory: unknown = JSON.parse(
        await readFile(join(distPath, ".vite/static-assets.json"), "utf8"),
      );
      expect(inventory).toEqual(
        expect.arrayContaining([
          "index.html",
          ...originalAssets.map((filename) => {
            return `assets/${filename}`;
          }),
        ]),
      );
      expect(inventory).toHaveLength(originalAssets.length + 1);
      await Promise.all(
        originalAssets.map(async (filename) => {
          const identity = await built.inject({
            url: `/assets/${filename}`,
            headers: { "accept-encoding": "identity" },
          });
          expect(identity.statusCode).toBe(200);
          expect(identity.headers["cache-control"]).toBe(
            IMMUTABLE_CACHE_CONTROL,
          );
        }),
      );
      expect(
        filenames.filter((filename) => {
          return /\.wasm\.(br|gz)$/.test(filename);
        }),
      ).toEqual([]);
      await Promise.all(
        [
          "index.html",
          `assets/${entry}`,
          `assets/${worker}`,
          `assets/${heicHelper}`,
          `assets/${css}`,
        ].map(async (filename) => {
          const original = await readFile(join(distPath, filename));
          const validators = new Set<string>();
          await Promise.all(
            ["identity", "gzip", "br"].map(async (encoding) => {
              const response = await built.inject({
                url: `/${filename}`,
                headers: { "accept-encoding": encoding },
              });
              const decoded =
                encoding === "br"
                  ? brotliDecompressSync(response.rawPayload)
                  : encoding === "gzip"
                    ? gunzipSync(response.rawPayload)
                    : response.rawPayload;
              expect(decoded).toEqual(original);
              expect(response.headers["content-type"]).toMatch(
                filename.endsWith(".html")
                  ? /^text\/html/
                  : filename.endsWith(".css")
                    ? /^text\/css/
                    : /^application\/javascript/,
              );
              expect(response.headers["content-encoding"]).toBe(
                encoding === "identity" ? undefined : encoding,
              );
              expect(Number(response.headers["content-length"])).toBe(
                response.rawPayload.byteLength,
              );
              expect(response.headers["cache-control"]).toBe(
                filename === "index.html"
                  ? "no-cache"
                  : IMMUTABLE_CACHE_CONTROL,
              );
              expect(response.headers.vary).toBe("Accept-Encoding");
              validators.add(String(response.headers.etag));
              const unchanged = await built.inject({
                url: `/${filename}`,
                headers: {
                  "accept-encoding": encoding,
                  "if-none-match": String(response.headers.etag),
                },
              });
              expect(unchanged.statusCode).toBe(304);
              expect(unchanged.body).toBe("");
              const otherEncoding =
                encoding === "identity" ? "gzip" : "identity";
              const changedRepresentation = await built.inject({
                url: `/${filename}`,
                headers: {
                  "accept-encoding": otherEncoding,
                  "if-none-match": String(response.headers.etag),
                },
              });
              expect(changedRepresentation.statusCode).toBe(200);
            }),
          );
          expect(validators.size).toBe(3);
        }),
      );
    });
  },
);
