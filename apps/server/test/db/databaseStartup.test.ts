import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import SQLite from "better-sqlite3";
import { expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/client.ts";

it("opens WAL after real startup lock contention and restores connection settings", async () => {
  const directory = mkdtempSync(join(tmpdir(), "database-startup-"));
  const path = join(directory, "catalog.db");
  const writer = new SQLite(path);
  writer.exec(
    "create table memories(title text); begin immediate; insert into memories values ('family')",
  );
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("./databaseStartupProcessFixture.ts", import.meta.url),
      ),
      path,
    ],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let output = "";
  let errors = "";
  child.stdout!.on("data", (data: Buffer) => {
    output += data.toString();
  });
  child.stderr!.on("data", (data: Buffer) => {
    errors += data.toString();
  });
  child.on("message", (message) => {
    if (message === "wal-busy" && writer.inTransaction) {
      writer.exec("commit");
    }
  });
  try {
    const exitCode = await new Promise<number | null>((done, reject) => {
      child.on("error", reject);
      child.on("exit", done);
    });
    expect(exitCode, errors).toBe(0);
    expect(JSON.parse(output)).toEqual({
      journal: [{ journal_mode: "wal" }],
      timeout: [{ timeout: 5000 }],
      foreignKeys: [{ foreign_keys: 1 }],
      memories: [{ title: "family" }],
    });
  } finally {
    child.kill("SIGKILL");
    writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each(["busy deadline", "invalid catalog"])(
  "closes the failed connection and preserves the SQLite error for %s",
  (failure) => {
    const directory = mkdtempSync(join(tmpdir(), "database-startup-failure-"));
    const path = join(directory, "catalog.db");
    const writer = failure === "busy deadline" ? new SQLite(path) : undefined;
    if (writer) {
      writer.exec("create table memories(title text); begin immediate");
      vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(5000);
    } else {
      writeFileSync(path, "Not a SQLite database");
    }
    vi.spyOn(Atomics, "wait").mockImplementation(() => {
      throw new Error(
        "Must not wait after the deadline or for a non-BUSY error",
      );
    });
    const pragma = SQLite.prototype.pragma;
    let sqliteError: unknown;
    const pragmaSpy = vi
      .spyOn(SQLite.prototype, "pragma")
      .mockImplementation(function (this: SQLite.Database, source, options) {
        try {
          return pragma.call(this, source, options);
        } catch (error) {
          sqliteError = error;
          throw error;
        }
      });
    try {
      let failureFromStartup: unknown;
      try {
        createDatabase(path);
      } catch (error) {
        failureFromStartup = error;
      }
      expect(failureFromStartup).toMatchObject({
        code: writer ? "SQLITE_BUSY" : "SQLITE_NOTADB",
      });
      expect(failureFromStartup).toBe(sqliteError);
      const attemptedConnection = pragmaSpy.mock.contexts[0] as
        | SQLite.Database
        | undefined;
      expect(attemptedConnection?.open).toBe(false);
    } finally {
      const attemptedConnection = pragmaSpy.mock.contexts[0] as
        | SQLite.Database
        | undefined;
      vi.restoreAllMocks();
      attemptedConnection?.close();
      writer?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
