import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import SQLite from "better-sqlite3";
import { sql, type Kysely } from "kysely";
import type { Database } from "./types/db.types.ts";

/** Makes a WAL-consistent backup, refusing to overwrite an existing file. */
export async function backupDatabase(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  const source = new SQLite(sourcePath, {
    readonly: true,
    fileMustExist: true,
  });
  let hasDestination = false;
  try {
    closeSync(openSync(destinationPath, "wx", 0o600));
    hasDestination = true;
    await source.backup(destinationPath);
    const backup = new SQLite(destinationPath, { fileMustExist: true });
    try {
      backup.pragma("journal_mode = DELETE");
      const integrity = backup.pragma("integrity_check") as Array<{
        integrity_check: string;
      }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
        throw new Error("Backup integrity check failed");
      }
      if ((backup.pragma("foreign_key_check") as unknown[]).length !== 0) {
        throw new Error("Backup foreign key check failed");
      }
    } finally {
      backup.close();
    }
  } catch (error) {
    if (hasDestination) {
      rmSync(destinationPath, { force: true });
    }
    throw error;
  } finally {
    source.close();
  }
}

/** Called under the migration write lock, before the first database write. */
export async function backupMigrationDatabase(
  database: Kysely<Database>,
): Promise<void> {
  const databases = await sql<{
    name: string;
    file: string;
  }>`pragma database_list`.execute(database);
  const path = databases.rows.find((entry) => {
    return entry.name === "main";
  })?.file;
  if (!path) {
    return;
  }
  const backupDirectory = join(dirname(path), "backups");
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const destination = join(
    backupDirectory,
    `${basename(path)}.${Date.now()}.${randomUUID()}.db`,
  );
  await backupDatabase(path, destination);
  console.log(`Pre-migration backup: ${destination}`);
}
