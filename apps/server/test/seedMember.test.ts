import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import {
  getSeedArgumentsFromArgv,
  MEMBER_ROLES,
  seedMember,
} from "../scripts/seedMember.ts";

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
      baseUrl: "http://localhost:38473",
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
      baseUrl: "http://localhost:38473",
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
      baseUrl: "http://localhost:38473",
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
      baseUrl: "http://localhost:38473",
    });

    const setting = await database
      .selectFrom("settings")
      .select("value")
      .where("key", "=", "public.base_url")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(setting.value)).toBe("http://localhost:38473");

    await database.destroy();
  });

  it("returns the member already there rather than a second row", async () => {
    const database = await _freshDatabase();
    const options = {
      database,
      email: "abuela@example.com",
      role: "admin" as const,
      baseUrl: "http://localhost:38473",
    };

    const first = await seedMember(options);
    const second = await seedMember(options);

    expect(second.memberId).toBe(first.memberId);
    expect(second.wasAlreadyThere).toBe(true);

    await database.destroy();
  });
});

describe("getSeedArgumentsFromArgv", () => {
  it("defaults the role and the base URL when only an address is given", () => {
    expect(getSeedArgumentsFromArgv(["abuela@example.com"])).toEqual({
      email: "abuela@example.com",
      role: "admin",
      baseUrl: "http://localhost:38473",
    });
  });

  it("takes both flags, in either order, before or after the address", () => {
    expect(
      getSeedArgumentsFromArgv([
        "--role",
        "viewer",
        "abuela@example.com",
        "--base-url",
        "https://shoebox.example",
      ]),
    ).toEqual({
      email: "abuela@example.com",
      role: "viewer",
      baseUrl: "https://shoebox.example",
    });
  });

  // The defect this was written for: `viwer` type-checked, and the refusal
  // arrived as a SQLite constraint on `members.role` several statements later,
  // naming the column rather than the flag that was mistyped.
  it("refuses a role that is not one of the three", () => {
    expect(
      getSeedArgumentsFromArgv(["abuela@example.com", "--role", "viwer"]),
    ).toBeUndefined();
  });

  it("accepts each of the three roles", () => {
    for (const role of MEMBER_ROLES) {
      expect(
        getSeedArgumentsFromArgv(["abuela@example.com", "--role", role]),
      ).toEqual({
        email: "abuela@example.com",
        role,
        baseUrl: "http://localhost:38473",
      });
    }
  });

  // The other half of the same defect: the old reader took whatever word
  // followed `--role`, so this read `--base-url` as the role.
  it("refuses a flag whose value is the next flag", () => {
    expect(
      getSeedArgumentsFromArgv([
        "abuela@example.com",
        "--role",
        "--base-url",
        "https://shoebox.example",
      ]),
    ).toBeUndefined();
  });

  it("refuses a flag with nothing after it at all", () => {
    expect(
      getSeedArgumentsFromArgv(["abuela@example.com", "--role"]),
    ).toBeUndefined();
  });

  // A flag's value belongs to its flag. The old reader found the address by
  // taking the first word that did not start with `--`, which here is
  // `viewer`, and seeded a member at the address "viewer".
  it("does not mistake a flag's value for the address", () => {
    expect(
      getSeedArgumentsFromArgv(["--role", "viewer", "abuela@example.com"]),
    ).toEqual({
      email: "abuela@example.com",
      role: "viewer",
      baseUrl: "http://localhost:38473",
    });
  });

  it("refuses an empty command line, an unknown flag, and two addresses", () => {
    expect(getSeedArgumentsFromArgv([])).toBeUndefined();
    expect(
      getSeedArgumentsFromArgv(["abuela@example.com", "--admin"]),
    ).toBeUndefined();
    expect(
      getSeedArgumentsFromArgv(["abuela@example.com", "tio@example.com"]),
    ).toBeUndefined();
  });
});
