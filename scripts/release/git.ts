import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION_PATTERN } from "./version";

/** Product manifests share one deployment and therefore one release version. */
export const MANIFEST_PATHS: string[] = [
  "package.json",
  "apps/web/package.json",
  "apps/server/package.json",
  "packages/shared/package.json",
  "packages/emails/package.json",
];

/** Run Git with argument arrays so commit messages never become shell code. */
export function runGit(options: {
  repository: string;
  args: string[];
}): string {
  return execFileSync("git", options.args, {
    cwd: options.repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Determine whether a queued source commit is already covered by a tag. */
export function isAncestor(options: {
  repository: string;
  ancestor: string;
  descendant: string;
}): boolean {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", options.ancestor, options.descendant],
    { cwd: options.repository },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error("Cannot validate source commit ancestry");
  }
  return result.status === 0;
}

/** Validate synchronized manifests at a source commit or a published tag. */
export function getVersionFromRef(options: {
  repository: string;
  ref: string;
}): string {
  const versions = MANIFEST_PATHS.map((path) => {
    const manifest: unknown = JSON.parse(
      runGit({
        repository: options.repository,
        args: ["show", `${options.ref}:${path}`],
      }),
    );
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !("version" in manifest) ||
      typeof manifest.version !== "string" ||
      !VERSION_PATTERN.test(manifest.version)
    ) {
      throw new Error(`Invalid manifest version: ${path}`);
    }
    return manifest.version;
  });
  const version = versions[0];
  if (
    version === undefined ||
    versions.some((item) => {
      return item !== version;
    })
  ) {
    throw new Error(`Product manifest versions disagree at ${options.ref}`);
  }
  return version;
}

/** Synchronize manifests without changing unrelated manifest properties. */
export function syncManifestVersions(options: {
  repository: string;
  version: string;
}): void {
  MANIFEST_PATHS.forEach((path) => {
    const filePath = join(options.repository, path);
    const manifest: Record<string, unknown> = JSON.parse(
      readFileSync(filePath, "utf8"),
    );
    writeFileSync(
      filePath,
      `${JSON.stringify({ ...manifest, version: options.version }, undefined, 2)}\n`,
    );
  });
}

/** Only remote, stable version tags reachable from main define release history. */
export function getTagsFromRemoteMain(repository: string): string[] {
  const remoteTags = new Set(
    runGit({ repository, args: ["ls-remote", "--tags", "--refs", "origin"] })
      .split("\n")
      .map((line) => {
        return line.split("\t")[1]?.replace("refs/tags/", "");
      }),
  );
  return runGit({
    repository,
    args: ["tag", "--merged", "origin/main", "--sort=version:refname"],
  })
    .split("\n")
    .filter((tag) => {
      return (
        tag.startsWith("v") &&
        VERSION_PATTERN.test(tag.slice(1)) &&
        remoteTags.has(tag)
      );
    });
}

/** Read complete messages or human notes over the same cumulative range. */
export function getLogFromRange(options: {
  repository: string;
  previousTag?: string;
  source: string;
  format: string;
}): string {
  const range =
    options.previousTag === undefined
      ? options.source
      : `${options.previousTag}..${options.source}`;
  return runGit({
    repository: options.repository,
    args: ["log", "--reverse", `--format=${options.format}`, range, "--"],
  });
}
