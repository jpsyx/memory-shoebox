import { readFile, readdir } from "node:fs/promises";

import { join } from "node:path";

import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  IMMUTABLE_CACHE_CONTROL,
  installStaticSpaTestLifecycle,
  makeServerFromDirectory,
} from "./staticSpaTestHelpers.ts";
installStaticSpaTestLifecycle();
describe.skipIf(!process.env.STATIC_SPA_BUILT_OUTPUT)(
  "real built output",
  () => {
    it("serves matching compressed entry and worker artifacts with representation validators", async () => {
      const distPath = join(import.meta.dirname, "../../../../web/dist");
      const built = await makeServerFromDirectory(distPath);
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
              const conditionalRange = await built.inject({
                url: `/${filename}`,
                headers: {
                  "accept-encoding": encoding,
                  "if-none-match": String(response.headers.etag),
                  range: "bytes=999999999-",
                },
              });
              expect(conditionalRange.statusCode).toBe(304);
              expect(conditionalRange.rawPayload.byteLength).toBe(0);
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
