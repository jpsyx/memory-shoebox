import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { seedMember } from "../scripts/seedMember.ts";

async function _freshDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("seedMember", () => {
  it("creates an active member at the address, ready to sign in", async () => {
    const database = await _freshDatabase();

    const seeded = await seedMember({
      database,
      email: "Abuela@Example.COM",
      role: "admin",
      baseUrl: "http://localhost:5173",
    });

    const row = await database
      .selectFrom("members")
      .selectAll()
      .where("id", "=", seeded.memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("abuela@example.com");
    expect(row.role).toBe("admin");
    expect(row.status).toBe("invited");

    await database.destroy();
  });

  it("respects the requested role rather than always seeding admin", async () => {
    const database = await _freshDatabase();

    const seeded = await seedMember({
      database,
      email: "abuela@example.com",
      role: "viewer",
      baseUrl: "http://localhost:5173",
    });

    const row = await database
      .selectFrom("members")
      .selectAll()
      .where("id", "=", seeded.memberId)
      .executeTakeFirstOrThrow();
    expect(row.role).toBe("viewer");

    await database.destroy();
  });

  it("trims and lowercases a padded address, in both the row and the return value", async () => {
    const database = await _freshDatabase();

    const seeded = await seedMember({
      database,
      email: "  Abuela@Example.COM  ",
      role: "admin",
      baseUrl: "http://localhost:5173",
    });

    expect(seeded.email).toBe("abuela@example.com");

    const row = await database
      .selectFrom("members")
      .selectAll()
      .where("id", "=", seeded.memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("abuela@example.com");

    await database.destroy();
  });

  it("writes public.base_url, without which a sign-in code is born scrubbed", async () => {
    const database = await _freshDatabase();

    await seedMember({
      database,
      email: "abuela@example.com",
      role: "admin",
      baseUrl: "http://localhost:5173",
    });

    const setting = await database
      .selectFrom("settings")
      .select("value")
      .where("key", "=", "public.base_url")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(setting.value)).toBe("http://localhost:5173");

    await database.destroy();
  });

  it("returns the member already there rather than a second row", async () => {
    const database = await _freshDatabase();
    const options = {
      database,
      email: "abuela@example.com",
      role: "admin" as const,
      baseUrl: "http://localhost:5173",
    };

    const first = await seedMember(options);
    const second = await seedMember(options);

    expect(second.memberId).toBe(first.memberId);
    expect(second.wasAlreadyThere).toBe(true);

    await database.destroy();
  });
});
