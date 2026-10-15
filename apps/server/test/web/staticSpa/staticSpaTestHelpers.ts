import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { tmpdir } from "node:os";

import { join } from "node:path";

import { brotliCompressSync, gzipSync } from "node:zlib";

import Fastify, { type FastifyInstance } from "fastify";

import { afterEach, beforeEach } from "vitest";

import { registerStaticSpa } from "../../../src/web/staticSpa.ts";
/** Shared scenario fixture. */
export const HTML = `<html><body>${"family memories ".repeat(200)}</body></html>`;
/** Shared scenario fixture. */
export const JAVASCRIPT = `console.log(${JSON.stringify("family memories ".repeat(200))});`;
/** Shared scenario fixture. */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
/** Shared scenario fixture. */
export const SERVERS: FastifyInstance[] = [];
/** Shared scenario fixture. */
export let directory: string;
/** Shared scenario fixture. */
export let app: FastifyInstance;
/** Shared scenario fixture. */
export async function makeServerFromDirectory(
  distPath: string,
): Promise<FastifyInstance> {
  const server = Fastify();
  SERVERS.push(server);
  await registerStaticSpa(server, { distPath });
  return server;
}
/** Registers the owned scenario setup and cleanup. */
export function installStaticSpaTestLifecycle(): void {
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
          await writeFile(
            join(directory, `${filename}.gz`),
            gzipSync(contents!),
          );
          await writeFile(
            join(directory, `${filename}.br`),
            brotliCompressSync(contents!),
          );
        }
      }),
    );
    app = await makeServerFromDirectory(directory);
  });

  afterEach(async () => {
    await Promise.all(
      SERVERS.splice(0).map((server) => {
        return server.close();
      }),
    );
    await rm(directory, { recursive: true, force: true });
  });
}
