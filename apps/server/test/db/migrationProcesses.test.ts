import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import SQLite from "better-sqlite3";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  children.splice(0).forEach((child) => {
    return child.kill("SIGKILL");
  });
  directories.splice(0).forEach((directory) => {
    return rmSync(directory, { recursive: true, force: true });
  });
});
function _run(path: string, marker: string, mode = "finish") {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./migrationProcessFixture.ts", import.meta.url)),
      path,
      marker,
      mode,
    ],
    { stdio: "pipe" },
  );
  children.push(child);
  let errors = "";
  child.stderr!.on("data", (data: Buffer) => {
    errors += data.toString();
  });
  const completed = new Promise<number | null>((done, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(errors));
      } else {
        done(code);
      }
    });
  });
  return { child, completed };
}
function _paths() {
  const directory = mkdtempSync(join(tmpdir(), "migration-process-"));
  directories.push(directory);
  return {
    directory,
    path: join(directory, "catalog.db"),
    marker: join(directory, "ready"),
  };
}
it("serializes independent migration processes before they read history or take backups", async () => {
  const { directory, path, marker } = _paths();
  const first = _run(path, marker);
  const second = _run(path, marker);
  expect(await Promise.all([first.completed, second.completed])).toEqual([
    0, 0,
  ]);
  const database = new SQLite(path);
  expect(database.prepare("select * from process_memories").all()).toEqual([
    { title: "family" },
  ]);
  expect(database.prepare("select name from kysely_migration").all()).toEqual([
    { name: "0001" },
  ]);
  database.close();
  expect(readdirSync(join(directory, "backups"))).toHaveLength(1);
});
it("rolls back uncommitted schema, data and history after SIGKILL and can retry", async () => {
  const { path, marker } = _paths();
  const running = _run(path, marker, "wait");
  await expect
    .poll(() => {
      return existsSync(marker);
    })
    .toBe(true);
  running.child.kill("SIGKILL");
  await running.completed;
  const database = new SQLite(path);
  expect(
    database
      .prepare("select name from sqlite_master where type = 'table'")
      .all(),
  ).toEqual([]);
  expect(database.pragma("integrity_check")).toEqual([
    { integrity_check: "ok" },
  ]);
  database.close();
  expect(await _run(path, marker).completed).toBe(0);
});
