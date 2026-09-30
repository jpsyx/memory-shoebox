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
  getEnvFilesArgumentsFromArgv,
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

  it("keeps a file somebody has already filled in", () => {
    writeFileSync(_target("server").rootPath, "KEY=a-real-secret\n");

    const actions = resetEnvFiles({ targets: [_target("server")] });

    expect(actions[0]?.outcome).toBe("kept");
    expect(readFileSync(_target("server").rootPath, "utf8")).toBe(
      "KEY=a-real-secret\n",
    );
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

describe("getEnvFilesArgumentsFromArgv", () => {
  it("reads a command on its own as every package", () => {
    expect(getEnvFilesArgumentsFromArgv(["reset"])).toEqual({
      command: "reset",
      name: undefined,
      force: false,
    });
  });

  it("reads one package name", () => {
    expect(getEnvFilesArgumentsFromArgv(["sync", "web"])?.name).toBe("web");
  });

  it("takes the bare separator pnpm forwards ahead of a flag", () => {
    // `pnpm reset-env -- --force` arrives as ["reset", "--", "--force"], and
    // a walk that counted `--` as a package name would refuse it.
    expect(getEnvFilesArgumentsFromArgv(["reset", "--", "--force"])).toEqual({
      command: "reset",
      name: undefined,
      force: true,
    });
  });

  it("takes the flag without a separator too", () => {
    expect(getEnvFilesArgumentsFromArgv(["reset", "--force"])?.force).toBe(
      true,
    );
  });

  it("refuses a package that keeps no environment file", () => {
    expect(
      getEnvFilesArgumentsFromArgv(["sync", "prototypes"]),
    ).toBeUndefined();
  });

  it("refuses a command it does not have", () => {
    expect(getEnvFilesArgumentsFromArgv(["destroy"])).toBeUndefined();
    expect(getEnvFilesArgumentsFromArgv([])).toBeUndefined();
  });
});
