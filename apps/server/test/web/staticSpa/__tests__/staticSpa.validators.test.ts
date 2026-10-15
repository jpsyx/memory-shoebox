import { utimes, writeFile } from "node:fs/promises";

import { join } from "node:path";

import {
  brotliCompressSync,
  brotliDecompressSync,
  gunzipSync,
  gzipSync,
} from "node:zlib";

import { expect, it } from "vitest";

import {
  app,
  directory,
  installStaticSpaTestLifecycle,
  makeServerFromDirectory,
} from "./staticSpaTestHelpers.ts";
installStaticSpaTestLifecycle();

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
  const collisionApp = await makeServerFromDirectory(directory);
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

it.each(["identity", "gzip", "br"])(
  "evaluates %s validators before unsatisfiable ranges for GET and HEAD",
  async (encoding) => {
    const url = "/assets/main-Da_0-abc.js";
    const original = await app.inject({
      url,
      headers: { "accept-encoding": encoding },
    });
    await Promise.all(
      ["GET", "HEAD"].map(async (method) => {
        const headers = {
          "accept-encoding": encoding,
          range: "bytes=999999999-",
        };
        const matching = await app.inject({
          method: method as "GET" | "HEAD",
          url,
          headers: {
            ...headers,
            "if-none-match": String(original.headers.etag),
          },
        });
        expect(matching.statusCode).toBe(304);
        expect(matching.rawPayload.byteLength).toBe(0);
        expect(matching.headers.etag).toBe(original.headers.etag);
        expect(matching.headers.vary).toBe("Accept-Encoding");
        expect(matching.headers["content-range"]).toBeUndefined();
        const nonmatching = await app.inject({
          method: method as "GET" | "HEAD",
          url,
          headers: { ...headers, "if-none-match": '"other"' },
        });
        expect(nonmatching.statusCode).toBe(416);
        const wildcard = await app.inject({
          method: method as "GET" | "HEAD",
          url,
          headers: { ...headers, "if-none-match": "*" },
        });
        expect(wildcard.statusCode).toBe(304);
        expect(wildcard.rawPayload.byteLength).toBe(0);
        const ordinaryRange = await app.inject({
          method: method as "GET" | "HEAD",
          url,
          headers: {
            ...headers,
            range: "bytes=0-5",
            "if-none-match": '"other"',
          },
        });
        expect(ordinaryRange.statusCode).toBe(206);
        expect(ordinaryRange.rawPayload).toEqual(
          method === "HEAD"
            ? Buffer.alloc(0)
            : original.rawPayload.subarray(0, 6),
        );
        const crossEncoding = await app.inject({
          method: method as "GET" | "HEAD",
          url,
          headers: {
            ...headers,
            "accept-encoding": encoding === "identity" ? "gzip" : "identity",
            "if-none-match": String(original.headers.etag),
          },
        });
        expect(crossEncoding.statusCode).toBe(416);
        await Promise.all(
          [
            { "if-match": '"other"' },
            { "if-unmodified-since": "Thu, 01 Jan 1970 00:00:00 GMT" },
            {
              "if-match": "*",
              "if-unmodified-since": "Thu, 01 Jan 1970 00:00:00 GMT",
            },
          ].map(async (earlierPrecondition) => {
            const failed = await app.inject({
              method: method as "GET" | "HEAD",
              url,
              headers: {
                ...headers,
                "if-none-match": String(original.headers.etag),
                ...earlierPrecondition,
              },
            });
            expect(failed.statusCode).toBe(412);
          }),
        );
        const passedPreconditions = await app.inject({
          method: method as "GET" | "HEAD",
          url,
          headers: {
            ...headers,
            "if-none-match": String(original.headers.etag),
            "if-match": "*",
            "if-unmodified-since": "Fri, 01 Jan 2100 00:00:00 GMT",
          },
        });
        expect(passedPreconditions.statusCode).toBe(304);
      }),
    );
  },
);

it.each(["/index.html", "/", "/items/deep-link"])(
  "revalidates HTML before ranges at %s",
  async (url) => {
    const original = await app.inject({
      url,
      headers: { "accept-encoding": "br" },
    });
    const response = await app.inject({
      url,
      headers: {
        "accept-encoding": "br",
        "if-none-match": String(original.headers.etag),
        range: "bytes=999999999-",
      },
    });
    expect(response.statusCode).toBe(304);
    expect(response.body).toBe("");
    expect(response.headers["cache-control"]).toBe("no-cache");
  },
);
