import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeGitHubPublisherFromConfig } from "./github";

function _expireIdleConnectionsWhileBlocked(options: {
  server: ChildProcess;
  closedSignal: string;
}): void {
  options.server.send("expire");
  // Wait synchronously for socket closure, as verification blocks the CLI.
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { existsSync } from "node:fs";
       setInterval(() => {
         if (existsSync(process.argv[1])) { process.exit(0); }
       }, 10);`,
      options.closedSignal,
    ],
    { timeout: 5000 },
  );
}

describe("GitHub API publication boundary", () => {
  it("can publish after verification blocks while the API expires idle sockets", async () => {
    const directory = mkdtempSync(join(tmpdir(), "shoebox-release-api-"));
    const closedSignal = join(directory, "closed");
    const server = spawn(
      process.execPath,
      [join(import.meta.dirname, "fixtures/idle-api-server.mjs"), closedSignal],
      { stdio: ["ignore", "ignore", "inherit", "ipc"] },
    );
    const closed = new Promise<void>((resolve) => {
      server.once("close", () => {
        resolve();
      });
    });
    onTestFinished(async () => {
      server.kill();
      await closed;
      rmSync(directory, { recursive: true, force: true });
    });
    const [port] = await once(server, "message");
    const github = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async (_url, init) => {
        return fetch(`http://127.0.0.1:${port}`, init);
      },
    });
    await [1, 2, 3, 4, 5, 6].reduce(async (previous, version) => {
      await previous;
      expect(await github.hasRelease(`v1.0.${version}`)).toBe(true);
      execFileSync("git", ["--version"]);
    }, Promise.resolve());
    _expireIdleConnectionsWhileBlocked({ server, closedSignal });
    expect(await github.hasRelease("v1.0.7")).toBe(true);
    await expect(
      github.publish({ tag: "v1.0.7", commit: "a".repeat(40), notes: "notes" }),
    ).resolves.toBeUndefined();
  });

  it.each([200, 404, 403])(
    "finishes release lookup bodies for HTTP %s",
    async (status) => {
      const response = new Response("{}", { status });
      const github = makeGitHubPublisherFromConfig({
        repository: "owner/project",
        token: "test",
        request: async () => {
          return response;
        },
      });
      await github.hasRelease("v1.0.0").catch(() => {});
      expect(response.bodyUsed).toBe(true);
    },
  );

  it.each([201, 500])(
    "finishes publication bodies for HTTP %s",
    async (status) => {
      const response = new Response("{}", { status });
      const github = makeGitHubPublisherFromConfig({
        repository: "owner/project",
        token: "test",
        request: async () => {
          return response;
        },
      });
      await github
        .publish({ tag: "v1.0.0", commit: "a".repeat(40), notes: "notes" })
        .catch(() => {});
      expect(response.bodyUsed).toBe(true);
    },
  );

  it("recognizes only 404 as missing, preserving authorization failures", async () => {
    const missing = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async () => {
        return new Response("", { status: 404 });
      },
    });
    expect(await missing.hasRelease("v1.0.0")).toBe(false);
    const denied = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async () => {
        return new Response("", { status: 403 });
      },
    });
    await expect(denied.hasRelease("v1.0.0")).rejects.toThrow(/403/);
  });

  it("targets an existing exact tag and sends commit notes as data", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const github = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });
        return new Response("{}", { status: 201 });
      },
    });
    await github.publish({
      tag: "v1.0.0",
      commit: "a".repeat(40),
      notes: "- feat: `$(touch nope)`",
    });
    expect(requests).toEqual([
      {
        url: "https://api.github.com/repos/owner/project/releases",
        body: {
          tag_name: "v1.0.0",
          target_commitish: "a".repeat(40),
          name: "v1.0.0",
          body: "- feat: `$(touch nope)`",
          draft: false,
          prerelease: false,
        },
      },
    ]);
  });

  it("propagates publication failures so a later run repairs the tag", async () => {
    const github = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async () => {
        return new Response("", { status: 500 });
      },
    });
    await expect(
      github.publish({ tag: "v1.0.0", commit: "a".repeat(40), notes: "notes" }),
    ).rejects.toThrow(/500/);
  });
});
