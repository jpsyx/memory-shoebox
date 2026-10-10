import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGitHubPublisherFromConfig } from "./github";
import { publishRelease } from "./release";

function _verifyCandidate(): Promise<void> {
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { stdio: "inherit" });
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@memory-shoebox/server",
      "exec",
      "playwright",
      "install",
      "--with-deps",
      "chromium",
    ],
    { stdio: "inherit" },
  );
  execFileSync("pnpm", ["check"], { stdio: "inherit" });
  const directory = mkdtempSync(join(tmpdir(), "shoebox-release-web-"));
  const fixture = join(directory, "web.env");
  try {
    writeFileSync(fixture, "", { mode: 0o600 });
    const digest = createHash("sha256").update("").digest("hex");
    execFileSync(
      "docker",
      [
        "build",
        "--secret",
        `id=web_env,src=${fixture}`,
        "--build-arg",
        `WEB_ENV_DIGEST=${digest}`,
        "-t",
        "memory-shoebox:release-check",
        ".",
      ],
      { stdio: "inherit" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return Promise.resolve();
}

try {
  if (process.env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "Publication CLI is restricted to GitHub Actions; run the local release tests instead",
    );
  }
  await publishRelease({
    repository: process.cwd(),
    eventCommit: process.env.RELEASE_EVENT_COMMIT ?? "",
    github: makeGitHubPublisherFromConfig({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      token: process.env.GH_TOKEN ?? "",
    }),
    verify: _verifyCandidate,
  });
  console.log("Release publication or recovery completed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Release failed");
  process.exitCode = 1;
}
