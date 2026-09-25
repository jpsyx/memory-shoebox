import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@famgram/shared";

/** Read once at import time: the version never changes while the process runs. */
const SERVER_VERSION: string = (() => {
  const manifestPath = fileURLToPath(
    new URL("../../package.json", import.meta.url),
  );
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  const version =
    typeof manifest === "object" && manifest !== null && "version" in manifest
      ? (manifest as { version: unknown }).version
      : undefined;
  return typeof version === "string" ? version : "unknown";
})();

/**
 * Registers `GET /health`, the unauthenticated liveness probe.
 *
 * Fly.io calls it to decide whether a machine is healthy, and a self-hoster
 * can call it to confirm which version is deployed. It deliberately reveals
 * nothing beyond that.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", (): HealthResponse => {
    return {
      status: "ok",
      version: SERVER_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });
}
