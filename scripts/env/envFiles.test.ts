import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getEnvTargetsFromArgv,
  getEnvTargetsFromRoot,
  resetEnvFiles,
  syncEnvFiles,
  type EnvTarget,
} from "./envFiles";

/** A throwaway repository root holding only the two committed examples. */
let root = "";

function _target(name: string): EnvTarget {
  const found = getEnvTargetsFromRoot(root).find((entry) => {
    return entry.name === name;
  });
  if (found === undefined) {
    throw new Error(`No env target called ${name}.`);
  }
  return found;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "env-files-"));
  getEnvTargetsFromRoot(root).forEach((target) => {
    mkdirSync(join(target.packagePath, ".."), { recursive: true });
    writeFileSync(target.examplePath, `# ${target.name} example\nKEY=\n`);
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("getEnvTargetsFromRoot", () => {
  it("names one target per package that has an example", () => {
    expect(
      getEnvTargetsFromRoot(root).map((target) => {
        return target.name;
      }),
    ).toEqual(["server", "web"]);
  });

  it("puts the file a person fills in at the repository root", () => {
    expect(_target("server").rootPath).toBe(join(root, ".env.server.local"));
    expect(_target("web").rootPath).toBe(join(root, ".env.web.local"));
  });

  it("puts the copy where each package's own tooling looks for it", () => {
    expect(_target("server").packagePath).toBe(
      join(root, "apps/server/.env.local"),
    );
    expect(_target("web").packagePath).toBe(join(root, "apps/web/.env.local"));
  });
});

describe("resetEnvFiles", () => {
  it("creates each root file from its example, keys and all", () => {
    const actions = resetEnvFiles({ targets: getEnvTargetsFromRoot(root) });

    expect(
      actions.map((action) => {
        return action.outcome;
      }),
    ).toEqual(["created", "created"]);
    expect(readFileSync(_target("server").rootPath, "utf8")).toBe(
      "# server example\nKEY=\n",
    );
  });

  it("leaves a filled-in file alone when it already has every key", () => {
    writeFileSync(_target("server").rootPath, "KEY=a-real-secret\n");

    const actions = resetEnvFiles({ targets: [_target("server")] });

    expect(actions[0]?.outcome).toBe("unchanged");
    expect(readFileSync(_target("server").rootPath, "utf8")).toBe(
      "KEY=a-real-secret\n",
    );
  });

  it("brings a key the example has gained, and keeps every value", () => {
    const target = _target("server");
    writeFileSync(
      target.examplePath,
      "# what it is for\nKEY=\n# and this\nNEW_KEY=\n",
    );
    writeFileSync(target.rootPath, "KEY=a-real-secret\n");

    const actions = resetEnvFiles({ targets: [target] });
    const written = readFileSync(target.rootPath, "utf8");

    expect(actions[0]?.outcome).toBe("merged");
    expect(actions[0]?.addedKeys).toEqual(["NEW_KEY"]);
    expect(written).toContain("KEY=a-real-secret");
    expect(written).toContain("# and this");
    expect(written).toContain("NEW_KEY=");
  });

  it("overwrites only when asked to, because the file holds secrets", () => {
    writeFileSync(_target("server").rootPath, "KEY=a-real-secret\n");

    const actions = resetEnvFiles({
      targets: [_target("server")],
      force: true,
    });

    expect(actions[0]?.outcome).toBe("created");
    expect(readFileSync(_target("server").rootPath, "utf8")).toBe(
      "# server example\nKEY=\n",
    );
  });
});

describe("syncEnvFiles", () => {
  it("copies the root file down to where the package reads it", () => {
    writeFileSync(_target("server").rootPath, "KEY=a-real-secret\n");

    const actions = syncEnvFiles({ targets: [_target("server")] });

    expect(actions[0]?.outcome).toBe("copied");
    expect(readFileSync(_target("server").packagePath, "utf8")).toBe(
      "KEY=a-real-secret\n",
    );
  });

  it("overwrites the package copy, so the root file is the one source", () => {
    writeFileSync(_target("server").rootPath, "KEY=the-new-one\n");
    writeFileSync(_target("server").packagePath, "KEY=the-old-one\n");

    syncEnvFiles({ targets: [_target("server")] });

    expect(readFileSync(_target("server").packagePath, "utf8")).toBe(
      "KEY=the-new-one\n",
    );
  });

  it("leaves a package file alone when there is no root file to copy", () => {
    writeFileSync(_target("server").packagePath, "KEY=set-up-by-hand\n");

    const actions = syncEnvFiles({ targets: [_target("server")] });

    expect(actions[0]?.outcome).toBe("no-source");
    expect(readFileSync(_target("server").packagePath, "utf8")).toBe(
      "KEY=set-up-by-hand\n",
    );
  });

  it("reports rather than throws when nothing has been set up at all", () => {
    const actions = syncEnvFiles({ targets: getEnvTargetsFromRoot(root) });

    expect(
      actions.every((action) => {
        return action.outcome === "no-source";
      }),
    ).toBe(true);
  });
});

describe("getEnvTargetsFromArgv", () => {
  it("reads no argument as every package", () => {
    expect(
      getEnvTargetsFromArgv({ argv: [], repositoryRoot: root })?.map(
        (target) => {
          return target.name;
        },
      ),
    ).toEqual(["server", "web"]);
  });

  it("narrows to one package by name", () => {
    expect(
      getEnvTargetsFromArgv({ argv: ["web"], repositoryRoot: root })?.map(
        (target) => {
          return target.name;
        },
      ),
    ).toEqual(["web"]);
  });

  it("takes the bare separator pnpm forwards ahead of a flag", () => {
    // `pnpm reset-env -- --force` arrives as ["--", "--force"], and a
    // positional read that counted `--` would refuse it.
    expect(
      getEnvTargetsFromArgv({
        argv: ["--", "--force"],
        repositoryRoot: root,
      })?.length,
    ).toBe(2);
  });

  it("refuses a package that keeps no environment file", () => {
    expect(
      getEnvTargetsFromArgv({ argv: ["prototypes"], repositoryRoot: root }),
    ).toBeUndefined();
  });

  it("refuses two package names", () => {
    expect(
      getEnvTargetsFromArgv({ argv: ["server", "web"], repositoryRoot: root }),
    ).toBeUndefined();
  });
});
