import { sql } from "kysely";
import { afterEach, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";

const sourceFormat = vi.hoisted(() => {
  return { value: "lf" as "lf" | "crlf" | "changed" };
});

// The loader reads real shipped bytes; only the filesystem boundary varies.
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readFile: async (path: Parameters<typeof original.readFile>[0]) => {
      const source = await original.readFile(path);
      const text = source.toString("utf8");
      if (sourceFormat.value === "crlf") {
        return Buffer.from(text.replaceAll("\n", "\r\n"));
      }
      return sourceFormat.value === "changed"
        ? Buffer.from(`${text}\n// genuine source edit\n`)
        : source;
    },
  };
});

const databases: Array<ReturnType<typeof createDatabase>> = [];
afterEach(async () => {
  sourceFormat.value = "lf";
  await Promise.all(
    databases.splice(0).map((database) => {
      return database.destroy();
    }),
  );
});

it("starts an LF catalog with the same migration sources materialized as CRLF", async () => {
  const database = createDatabase(":memory:");
  databases.push(database);
  await migrateToLatest(database);
  const originalLedger =
    await sql`select * from kysely_migration_checksums`.execute(database);
  sourceFormat.value = "crlf";
  await expect(migrateToLatest(database)).resolves.toEqual([]);
  expect(
    (await sql`select * from kysely_migration_checksums`.execute(database))
      .rows,
  ).toEqual(originalLedger.rows);
});

it("refuses startup after a genuine edit to the shipped migration source", async () => {
  const database = createDatabase(":memory:");
  databases.push(database);
  await migrateToLatest(database);
  const originalLedger =
    await sql`select * from kysely_migration_checksums`.execute(database);
  sourceFormat.value = "changed";
  await expect(migrateToLatest(database)).rejects.toThrow(/checksum/i);
  expect(
    (await sql`select * from kysely_migration_checksums`.execute(database))
      .rows,
  ).toEqual(originalLedger.rows);
});
