import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { CommentTaggingCatalog } from "../../comment-tagging/support/runCommentTaggingServer.ts";
import { startSecureCommentTaggingProxy } from "../../comment-tagging/support/startSecureCommentTaggingProxy.ts";

vi.mock("node:child_process", () => {
  return { execFileSync: vi.fn() };
});
vi.mock("node:https", () => {
  return { createServer: vi.fn() };
});
const initial = new Set(readdirSync(tmpdir()));
function _getOwnedDirectories(): string[] {
  return readdirSync(tmpdir()).filter((name) => {
    return name.startsWith("comment-tagging-tls-") && !initial.has(name);
  });
}
afterEach(() => {
  _getOwnedDirectories().forEach((name) => {
    rmSync(join(tmpdir(), name), { recursive: true, force: true });
  });
  vi.resetAllMocks();
});
it.each(["certificate", "construction", "listen"])(
  "cleans up partial TLS startup after %s failure",
  async (phase) => {
    const failure = new Error(`local ${phase} stub failed`);
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (phase === "certificate") {
        throw failure;
      }
      const paths = args as readonly string[];
      writeFileSync(paths[paths.indexOf("-keyout") + 1]!, "stub key");
      writeFileSync(paths[paths.indexOf("-out") + 1]!, "stub certificate");
      return Buffer.alloc(0);
    });
    const events = new EventEmitter();
    const close = vi.fn((callback: () => void) => {
      callback();
    });
    const server = Object.assign(events, {
      listen: () => {
        queueMicrotask(() => {
          events.emit("error", failure);
        });
      },
      closeAllConnections: vi.fn(),
      close,
    });
    vi.mocked(createServer).mockImplementation(() => {
      if (phase === "construction") {
        throw failure;
      }
      return server as unknown as ReturnType<typeof createServer>;
    });
    // Failure precedes catalog mutation; only the real upstream guards are
    // used.
    const catalog = {
      origin: "http://127.0.0.1:1234",
      endpoint: "http://127.0.0.1:1235",
    } as CommentTaggingCatalog;
    await expect(startSecureCommentTaggingProxy(catalog)).rejects.toThrow(
      failure.message,
    );
    expect(
      _getOwnedDirectories().filter((name) => {
        return existsSync(join(tmpdir(), name));
      }),
    ).toEqual([]);
    if (phase === "listen") {
      expect(close).toHaveBeenCalledOnce();
    }
  },
);
