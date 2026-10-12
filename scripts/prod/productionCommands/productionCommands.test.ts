import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runProductionB2, runProductionSql } from "./productionCommands";
import type { AttachedCommand } from "../runAttachedCommand/runAttachedCommand";

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  roots.forEach((root) => {
    rmSync(root, { recursive: true, force: true });
  });
  roots.length = 0;
});

function _createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "production-cli-test-"));
  roots.push(root);
  writeFileSync(
    join(root, ".env.deploy"),
    "FLY_APP=family-shoebox\nFLY_API_TOKEN=file-token\n",
  );
  writeFileSync(
    join(root, ".env.server.production"),
    [
      "DATABASE_PATH=/data/catalog.db",
      "B2_KEY_ID=file-key-id",
      "B2_APPLICATION_KEY='literal-$HOME-$(whoami)-`id`-\\key'",
      "B2_BUCKET=family-bucket",
      "B2_REGION=us-west-004",
      "B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com",
      "SESSION_SECRET=unrelated-secret",
    ].join("\n"),
  );
  return root;
}

it("forwards B2 arguments literally with file credentials and a private temporary cache", async () => {
  const root = _createFixture();
  vi.stubEnv("B2_APPLICATION_KEY_ID", "inherited-id");
  vi.stubEnv("B2_APPLICATION_KEY", "inherited-key");
  vi.stubEnv("B2_ENVIRONMENT", "dev");
  vi.stubEnv("B2_ACCOUNT_INFO", "/saved/account.sqlite");
  let cachePath = "";
  const args = ["ls", "b2://family-bucket/production/a '$() file", "--json"];
  const status = await runProductionB2({
    root,
    args,
    runner: async (command) => {
      expect(command.executable).toBe("b2");
      expect(command.args).toEqual(args);
      expect(command.env.B2_APPLICATION_KEY_ID).toBe("file-key-id");
      expect(command.env.B2_APPLICATION_KEY).toBe(
        "literal-$HOME-$(whoami)-`id`-\\key",
      );
      expect(command.env.B2_BUCKET).toBe("family-bucket");
      expect(command.env.B2_KEY_PREFIX).toBe("production");
      expect(command.env.B2_ENVIRONMENT).toBeUndefined();
      expect(command.env.SESSION_SECRET).toBeUndefined();
      expect(JSON.stringify(command.args)).not.toContain("file-key-id");
      cachePath = command.env.B2_ACCOUNT_INFO!;
      expect(command.env.XDG_CONFIG_HOME).toBe(dirname(cachePath));
      expect(cachePath).not.toBe("/saved/account.sqlite");
      writeFileSync(cachePath, "fixture-cache");
      return 7;
    },
  });
  expect(status).toBe(7);
  expect(existsSync(cachePath)).toBe(false);
});

it("cleans B2 authentication state when the CLI cannot start", async () => {
  const root = _createFixture();
  let cachePath = "";
  await expect(
    runProductionB2({
      root,
      args: ["ls"],
      runner: async (command) => {
        cachePath = command.env.B2_ACCOUNT_INFO!;
        writeFileSync(cachePath, "fixture-cache");
        throw new Error("CLI unavailable");
      },
    }),
  ).rejects.toThrow("CLI unavailable");
  expect(existsSync(cachePath)).toBe(false);
});

it("cleans B2 authentication state after the wrapper receives SIGTERM", () => {
  const root = _createFixture();
  const moduleUrl = new URL("./productionCommands.ts", import.meta.url).href;
  const runnerUrl = new URL(
    "../runAttachedCommand/runAttachedCommand.ts",
    import.meta.url,
  ).href;
  const cacheRecord = join(root, "cache-path.txt");
  const program = `
    import { writeFileSync } from 'node:fs';
    import { runProductionB2 } from ${JSON.stringify(moduleUrl)};
    import { runAttachedCommand } from ${JSON.stringify(runnerUrl)};
    const status = await runProductionB2({root: ${JSON.stringify(root)}, args: [], runner: async (command) => {
      writeFileSync(command.env.B2_ACCOUNT_INFO, 'test-cache');
      writeFileSync(${JSON.stringify(cacheRecord)}, command.env.B2_ACCOUNT_INFO);
      return runAttachedCommand({executable: process.execPath, env: command.env,
        args: ['-e', 'process.kill(process.ppid, "SIGTERM"); setTimeout(() => {}, 1000);']});
    }});
    process.exitCode = status;
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    { timeout: 5000 },
  );
  const cachePath = readFileSync(cacheRecord, "utf8");
  try {
    expect(child.status).toBe(143);
    expect(existsSync(cachePath)).toBe(false);
  } finally {
    rmSync(join(cachePath, ".."), { recursive: true, force: true });
  }
});

it("opens a Fly PTY for the SQLite shell and clears inherited Fly credentials", async () => {
  const root = _createFixture();
  vi.stubEnv("FLY_API_TOKEN", "inherited-api");
  vi.stubEnv("FLY_ACCESS_TOKEN", "inherited-access");
  await runProductionSql({
    root,
    args: [],
    runner: async (command) => {
      expect(command.executable).toBe("fly");
      expect(command.args).toEqual(
        expect.arrayContaining([
          "ssh",
          "console",
          "--app",
          "family-shoebox",
          "--pty",
        ]),
      );
      expect(command.env.FLY_API_TOKEN).toBe("file-token");
      expect(command.env.FLY_ACCESS_TOKEN).toBeUndefined();
      expect(command.args.join(" ")).not.toContain("file-token");
      return 0;
    },
  });
});

it("uses saved Fly login when the file token is blank", async () => {
  const root = _createFixture();
  writeFileSync(
    join(root, ".env.deploy"),
    "FLY_APP=family-shoebox\nFLY_API_TOKEN=\n",
  );
  vi.stubEnv("FLY_API_TOKEN", "inherited-api");
  vi.stubEnv("FLY_ACCESS_TOKEN", "inherited-access");
  await runProductionSql({
    root,
    args: ["SELECT 1;"],
    runner: async (command) => {
      expect(command.env.FLY_API_TOKEN).toBeUndefined();
      expect(command.env.FLY_ACCESS_TOKEN).toBeUndefined();
      expect(command.args).not.toContain("--pty");
      return 0;
    },
  });
});

it("runs multiple SQL statements without shell expansion and supports read-only access", async () => {
  const root = _createFixture();
  const databasePath = join(root, "catalog ' $ special.db");
  execFileSync("sqlite3", [databasePath, "CREATE TABLE example (value TEXT);"]);
  writeFileSync(
    join(root, ".env.server.production"),
    `DATABASE_PATH="${databasePath}"\n`,
  );
  const query =
    "-- Report query\nSELECT '$(touch should-not-exist) `id` $HOME' AS value; SELECT 42;";
  let output = "";
  const runner = async (command: AttachedCommand) => {
    const remoteCommand = command.args[command.args.indexOf("--command") + 1]!;
    const child = spawnSync("sh", ["-c", remoteCommand], {
      cwd: root,
      encoding: "utf8",
    });
    output = child.stdout;
    return child.status ?? 1;
  };
  expect(
    await runProductionSql({ root, args: ["--", "--readonly", query], runner }),
  ).toBe(0);
  expect(output).toContain("$(touch should-not-exist) `id` $HOME");
  expect(output).toContain("42");
  expect(existsSync(join(root, "should-not-exist"))).toBe(false);
  expect(
    await runProductionSql({
      root,
      args: ["--readonly", "INSERT INTO example VALUES ('no');"],
      runner,
    }),
  ).not.toBe(0);
});

it("refuses missing database files without creating an empty production catalog", async () => {
  const root = _createFixture();
  const databasePath = join(root, "missing.db");
  writeFileSync(
    join(root, ".env.server.production"),
    `DATABASE_PATH=${databasePath}\n`,
  );
  const status = await runProductionSql({
    root,
    args: ["SELECT 1;"],
    runner: async (command) => {
      const remoteCommand =
        command.args[command.args.indexOf("--command") + 1]!;
      return (
        spawnSync("sh", ["-c", remoteCommand], { encoding: "utf8" }).status ?? 1
      );
    },
  });
  expect(status).not.toBe(0);
  expect(existsSync(databasePath)).toBe(false);
});

it("reports missing configuration before starting an external command", async () => {
  const root = _createFixture();
  const runner = vi.fn(async () => {
    return 0;
  });
  writeFileSync(
    join(root, ".env.server.production"),
    "B2_KEY_ID=\nDATABASE_PATH=relative.db\n",
  );
  await expect(runProductionB2({ root, args: ["ls"], runner })).rejects.toThrow(
    /B2_KEY_ID.*B2_APPLICATION_KEY/s,
  );
  await expect(runProductionSql({ root, args: [], runner })).rejects.toThrow(
    /DATABASE_PATH/,
  );
  rmSync(join(root, ".env.deploy"));
  await expect(runProductionSql({ root, args: [], runner })).rejects.toThrow(
    /\.env.deploy/,
  );
  expect(runner).not.toHaveBeenCalled();
});

it("shows SQL usage without requiring production files", async () => {
  const root = _createFixture();
  rmSync(join(root, ".env.deploy"));
  const runner = vi.fn(async () => {
    return 0;
  });
  const log = vi.fn();
  expect(await runProductionSql({ root, args: ["--help"], runner, log })).toBe(
    0,
  );
  expect(log).toHaveBeenCalledWith(expect.stringContaining("prod:sql"));
  expect(runner).not.toHaveBeenCalled();
});
