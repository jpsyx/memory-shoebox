import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishRelease } from "./release";
import { getVersionFromCommits } from "./version";

const MANIFESTS = [
  "package.json",
  "apps/web/package.json",
  "apps/server/package.json",
  "packages/shared/package.json",
  "packages/emails/package.json",
];
const directories: string[] = [];

function _git(directory: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function _fixture() {
  const directory = mkdtempSync(join(tmpdir(), "shoebox-release-"));
  directories.push(directory);
  const remote = join(directory, "remote.git");
  const repository = join(directory, "checkout");
  _git(directory, "init", "--bare", "--initial-branch=main", remote);
  _git(directory, "clone", remote, repository);
  _git(repository, "config", "user.email", "release@example.test");
  _git(repository, "config", "user.name", "Release test");
  MANIFESTS.forEach((path) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(
      join(repository, path),
      `${JSON.stringify({ name: path, version: "0.0.0" }, undefined, 2)}\n`,
    );
  });
  _git(repository, "add", ".");
  _git(repository, "commit", "-m", "chore: initial source");
  _git(repository, "push", "origin", "main");
  const releases = new Map<string, { commit: string; notes: string }>();
  const github = {
    hasRelease: async (tag: string) => {
      return releases.has(tag);
    },
    publish: async (release: {
      tag: string;
      commit: string;
      notes: string;
    }) => {
      releases.set(release.tag, release);
    },
  };
  const verify = async () => {};
  return {
    repository,
    remote,
    releases,
    github,
    verify,
    eventCommit: _git(repository, "rev-parse", "HEAD"),
  };
}

function _commit(repository: string, message: string): string {
  _git(repository, "commit", "--allow-empty", "-m", message);
  _git(repository, "push", "origin", "HEAD:main");
  return _git(repository, "rev-parse", "HEAD");
}

afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

describe("semantic increments", () => {
  it.each([
    [undefined, ["feat!: first feature"], "1.0.0"],
    ["1.2.3", ["fix: bug", "feat(photo): albums", "docs: guide"], "1.3.0"],
    ["1.2.3", ["feat: albums", "fix!: incompatible contract"], "2.0.0"],
    [
      "1.2.3",
      ["chore: schema\n\nBREAKING CHANGE: old data contract removed"],
      "2.0.0",
    ],
    ["1.2.3", ["docs: guide", "arbitrary commit"], "1.2.4"],
  ])(
    "selects %s with the complete range",
    (previousVersion, messages, expected) => {
      expect(getVersionFromCommits({ previousVersion, messages })).toBe(
        expected,
      );
    },
  );
});

it("checks and atomically publishes the exact first version commit with all manifests", async () => {
  const fixture = _fixture();
  let checkedCommit = "";
  await publishRelease({
    ...fixture,
    verify: async (commit) => {
      checkedCommit = commit;
    },
  });
  const tagCommit = _git(fixture.remote, "rev-parse", "v1.0.0^{commit}");
  expect(tagCommit).toBe(checkedCommit);
  expect(_git(fixture.remote, "rev-parse", "main")).toBe(tagCommit);
  MANIFESTS.forEach((path) => {
    expect(
      JSON.parse(_git(fixture.remote, "show", `v1.0.0:${path}`)).version,
    ).toBe("1.0.0");
  });
  expect(fixture.releases.get("v1.0.0")?.commit).toBe(tagCommit);
  expect(fixture.releases.get("v1.0.0")?.notes).toContain(
    "chore: initial source",
  );
});

it("includes every unreleased commit and chooses the highest increment", async () => {
  const fixture = _fixture();
  await publishRelease(fixture);
  _commit(fixture.repository, "fix: first bug");
  _commit(fixture.repository, "feat(photo): new album");
  const eventCommit = _commit(fixture.repository, "docs: last guide");
  await publishRelease({ ...fixture, eventCommit });
  expect([...fixture.releases.keys()]).toEqual(["v1.0.0", "v1.1.0"]);
  const notes = fixture.releases.get("v1.1.0")?.notes;
  expect(notes).toContain("fix: first bug");
  expect(notes).toContain("feat(photo): new album");
  expect(notes).toContain("docs: last guide");
});

it("repairs a pushed tag after API failure before releasing newer source", async () => {
  const fixture = _fixture();
  await expect(
    publishRelease({
      ...fixture,
      github: {
        ...fixture.github,
        publish: async () => {
          throw new Error("API unavailable");
        },
      },
    }),
  ).rejects.toThrow("API unavailable");
  expect(_git(fixture.remote, "tag")).toBe("v1.0.0");
  const eventCommit = _commit(fixture.repository, "fix: newer source");
  await publishRelease({ ...fixture, eventCommit });
  expect([...fixture.releases.keys()]).toEqual(["v1.0.0", "v1.0.1"]);
});

it("repairs missing publication then no-ops for an already covered queued push", async () => {
  const fixture = _fixture();
  await expect(
    publishRelease({
      ...fixture,
      github: {
        ...fixture.github,
        publish: async () => {
          throw new Error("API unavailable");
        },
      },
    }),
  ).rejects.toThrow();
  await publishRelease(fixture);
  const releasedHead = _git(fixture.remote, "rev-parse", "main");
  _commit(fixture.repository, "feat: future queued change");
  await publishRelease(fixture);
  expect([...fixture.releases.keys()]).toEqual(["v1.0.0"]);
  expect(_git(fixture.remote, "tag")).toBe("v1.0.0");
  expect(_git(fixture.remote, "rev-parse", "main")).not.toBe(releasedHead);
});

it("refuses to publish when remote main advances during verification", async () => {
  const fixture = _fixture();
  const competitor = join(dirname(fixture.repository), "competitor");
  _git(dirname(fixture.repository), "clone", fixture.remote, competitor);
  _git(competitor, "config", "user.email", "test@example.test");
  _git(competitor, "config", "user.name", "Competitor");
  let advancedCommit = "";
  await expect(
    publishRelease({
      ...fixture,
      verify: async () => {
        advancedCommit = _commit(competitor, "feat: unchecked advancement");
      },
    }),
  ).rejects.toThrow(/main.*moved|main.*advanced/i);
  expect(_git(fixture.remote, "rev-parse", "main")).toBe(advancedCommit);
  expect(_git(fixture.remote, "tag")).toBe("");
  expect(fixture.releases.size).toBe(0);
});

it("does not publish either ref when branch policy rejects atomic push", async () => {
  const fixture = _fixture();
  const originalHead = _git(fixture.remote, "rev-parse", "main");
  const hook = join(fixture.remote, "hooks", "pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await expect(publishRelease(fixture)).rejects.toThrow(
    /branch.*rules|contents:write/i,
  );
  expect(_git(fixture.remote, "rev-parse", "main")).toBe(originalHead);
  expect(_git(fixture.remote, "tag")).toBe("");
});

it("failed verification leaves the remote unchanged", async () => {
  const fixture = _fixture();
  await expect(
    publishRelease({
      ...fixture,
      verify: async () => {
        throw new Error("checks failed");
      },
    }),
  ).rejects.toThrow("checks failed");
  expect(_git(fixture.remote, "rev-parse", "main")).toBe(fixture.eventCommit);
  expect(_git(fixture.remote, "tag")).toBe("");
});

it("fails closed when source manifests disagree", async () => {
  const fixture = _fixture();
  const manifestPath = join(fixture.repository, "apps/web/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, version: "0.2.0" }),
  );
  _git(fixture.repository, "add", ".");
  const eventCommit = _commit(
    fixture.repository,
    "chore: inconsistent versions",
  );
  await expect(publishRelease({ ...fixture, eventCommit })).rejects.toThrow(
    /manifest|version/i,
  );
  expect(_git(fixture.remote, "tag")).toBe("");
});

it("batches newer main commits only after checking their version candidate", async () => {
  const fixture = _fixture();
  await publishRelease(fixture);
  const eventCommit = _commit(fixture.repository, "fix: triggering source");
  const laterCommit = _commit(fixture.repository, "feat: later source");
  let checkedParent = "";
  await publishRelease({
    ...fixture,
    eventCommit,
    verify: async (commit) => {
      checkedParent = _git(fixture.repository, "rev-parse", `${commit}^`);
    },
  });
  expect(checkedParent).toBe(laterCommit);
  expect(_git(fixture.remote, "tag")).toBe("v1.0.0\nv1.1.0");
  expect(fixture.releases.get("v1.1.0")?.notes).toContain("feat: later source");
});

it("rejects candidate changes made by checks", async () => {
  const fixture = _fixture();
  await expect(
    publishRelease({
      ...fixture,
      verify: async () => {
        writeFileSync(join(fixture.repository, "package.json"), "{}");
      },
    }),
  ).rejects.toThrow(/checks changed/i);
  expect(_git(fixture.remote, "tag")).toBe("");
});

it("ignores conventional-looking headers inside ordinary commit bodies", () => {
  expect(
    getVersionFromCommits({
      previousVersion: "1.2.3",
      messages: ["docs: show examples\n\nfeat: example\nfix!: example"],
    }),
  ).toBe("1.2.4");
});
