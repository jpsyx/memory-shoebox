import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Migration } from "kysely";
import { migrations } from "./migrations/migrations.ts";

/** An immutable migration implementation and its source-byte fingerprint. */
export type MigrationSource = { migration: Migration; checksum: string };

/** Reads the registered standalone source files shipped with this release. */
export async function getMigrationSourcesFromFiles(): Promise<
  Record<string, MigrationSource>
> {
  const entries = await Promise.all(
    Object.entries(migrations).map(async ([name, migration]) => {
      const source = await readFile(
        new URL(`./migrations/${name}.ts`, import.meta.url),
      );
      return [
        name,
        {
          migration,
          checksum: createHash("sha256").update(source).digest("hex"),
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}
