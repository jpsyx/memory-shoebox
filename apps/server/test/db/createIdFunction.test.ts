import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { z } from "zod";
import { createDatabase } from "../../src/db/client.ts";

describe("the create_id() SQL function", () => {
  it("mints a uuid the contract's own id schema accepts", async () => {
    const database = createDatabase(":memory:");
    const result = await sql<{ id: string }>`select create_id() as id`.execute(
      database,
    );
    expect(z.uuid().safeParse(result.rows[0]?.id).success).toBe(true);
    await database.destroy();
  });

  it("mints a different id per row, which is what the seed needs", async () => {
    const database = createDatabase(":memory:");
    const result = await sql<{ id: string }>`
      select create_id() as id from (select 1 union all select 2 union all select 3)
    `.execute(database);
    expect(
      new Set(
        result.rows.map((row) => {
          return row.id;
        }),
      ).size,
    ).toBe(3);
    await database.destroy();
  });
});
