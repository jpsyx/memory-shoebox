import { writeFileSync } from "node:fs";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";

const [path, marker, mode] = process.argv.slice(2);
if (!path || !marker) {
  throw new Error("Missing process fixture arguments");
}
const database = createDatabase(path);
try {
  await migrateToLatest(database, {
    sources: {
      "0001": {
        checksum: "process-test",
        migration: {
          up: async (connection) => {
            await sql`create table process_memories (title text)`.execute(
              connection,
            );
            await sql`insert into process_memories values ('family')`.execute(
              connection,
            );
            writeFileSync(marker, "inside migration");
            if (mode === "wait") {
              await new Promise<void>((done) => {
                return setTimeout(done, 60_000);
              });
            } else {
              await new Promise<void>((done) => {
                return setTimeout(done, 100);
              });
            }
          },
        },
      },
    },
  });
} finally {
  await database.destroy();
}
