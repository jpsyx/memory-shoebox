import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import SQLite from "better-sqlite3";
import { expect, it } from "vitest";

it("backs up WAL data with plain Node and refuses overwrite or invalid arguments", () => {
  const directory = mkdtempSync(join(tmpdir(), "backup-cli-"));
  const sourcePath = join(directory, "catalog.db");
  const destination = join(directory, "backup.db");
  const source = new SQLite(sourcePath);
  const script = fileURLToPath(
    new URL("../../scripts/backupDatabase.ts", import.meta.url),
  );
  try {
    source.pragma("journal_mode = WAL");
    source.exec(
      "create table memories(title text); insert into memories values ('WAL family')",
    );
    const result = spawnSync(
      process.execPath,
      [script, sourcePath, destination],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const backup = new SQLite(destination);
    expect(backup.prepare("select * from memories").all()).toEqual([
      { title: "WAL family" },
    ]);
    backup.close();
    expect(
      spawnSync(process.execPath, [script, sourcePath, destination]).status,
    ).toBe(1);
    expect(spawnSync(process.execPath, [script]).status).toBe(1);
  } finally {
    source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
