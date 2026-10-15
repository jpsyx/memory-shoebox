import { rm, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { Readable } from "node:stream";

import Fastify from "fastify";

import { expect, it } from "vitest";

import { registerStaticSpa } from "../../../../src/web/staticSpa.ts";
import {
  HTML,
  JAVASCRIPT,
  SERVERS,
  app,
  directory,
  installStaticSpaTestLifecycle,
  makeServerFromDirectory,
} from "./staticSpaTestHelpers.ts";
installStaticSpaTestLifecycle();

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
    Array.from({ length: 5 }, async () => {
      const response = await lifecycleApp.inject({
        url: "/assets/main-Da_0-abc.js",
        headers: {
          "if-none-match": String(initial.headers.etag),
          range: "bytes=999999999-",
        },
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
    headers: {
      "if-none-match": 'W/"api-validator"',
      range: "bytes=999999999-",
    },
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
  const unbuilt = await makeServerFromDirectory(join(directory, "unbuilt"));
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
    const invalidInventoryApp = await makeServerFromDirectory(directory);
    const response = await invalidInventoryApp.inject(
      "/assets/main-Da_0-abc.js",
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JAVASCRIPT);
    expect(response.headers["cache-control"]).toBe("no-cache");
  },
);
