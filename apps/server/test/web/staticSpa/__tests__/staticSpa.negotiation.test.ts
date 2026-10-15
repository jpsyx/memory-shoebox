import { rm } from "node:fs/promises";

import { join } from "node:path";

import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { expect, it } from "vitest";

import {
  HTML,
  IMMUTABLE_CACHE_CONTROL,
  JAVASCRIPT,
  app,
  directory,
  installStaticSpaTestLifecycle,
} from "./staticSpaTestHelpers.ts";
installStaticSpaTestLifecycle();

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

it.each(["zstd", "gzip;q=0, br;q=0", "*", "gzip, br", "gzip;q=1, br;q=0.4"])(
  "keeps negotiated conditional-range representation for %s",
  async (acceptEncoding) => {
    const url = "/assets/main-Da_0-abc.js";
    const original = await app.inject({
      url,
      headers: { "accept-encoding": acceptEncoding },
    });
    const response = await app.inject({
      url,
      headers: {
        "accept-encoding": acceptEncoding,
        "if-none-match": String(original.headers.etag),
        range: "bytes=999999999-",
      },
    });
    expect(response.statusCode).toBe(304);
    expect(response.headers.etag).toBe(original.headers.etag);
  },
);

it("keeps conditional-range fallback when the preferred compressed file is missing", async () => {
  await rm(join(directory, "assets/main-Da_0-abc.js.br"));
  const url = "/assets/main-Da_0-abc.js";
  const original = await app.inject({
    url,
    headers: { "accept-encoding": "br, gzip" },
  });
  expect(original.headers["content-encoding"]).toBe("gzip");
  const response = await app.inject({
    url,
    headers: {
      "accept-encoding": "br, gzip",
      "if-none-match": String(original.headers.etag),
      range: "bytes=999999999-",
    },
  });
  expect(response.statusCode).toBe(304);
  expect(response.headers.etag).toBe(original.headers.etag);
});
