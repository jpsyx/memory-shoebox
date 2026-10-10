import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Migration } from "kysely";
import { migrations } from "./migrations/migrations.ts";

/** An immutable migration implementation and its normalized fingerprint. */
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
          checksum: createHash("sha256")
            .update(source.toString("utf8").replaceAll("\r\n", "\n"))
            .digest("hex"),
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}
