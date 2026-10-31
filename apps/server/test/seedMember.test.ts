import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
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
      displayName: "Abuela Rosa",
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
    expect(row.display_name).toBe("Abuela Rosa");
    expect(row.profile_completed_at).not.toBeNull();
    expect(
      await database
        .selectFrom("member_name_claims")
        .selectAll()
        .where("member_id", "=", seeded.memberId)
        .execute(),
    ).toHaveLength(1);

    await database.destroy();
  });

  it("respects the requested role rather than always seeding admin", async () => {
    const database = await _freshDatabase();

    const seeded = await seedMember({
      database,
      email: "abuela@example.com",
      displayName: "Abuela Rosa",
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
      displayName: "Abuela Rosa",
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
      displayName: "Abuela Rosa",
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
      displayName: "Abuela Rosa",
      role: "admin" as const,
      baseUrl: "http://localhost:38473",
    };

    const first = await seedMember(options);
    const second = await seedMember(options);

    expect(second.memberId).toBe(first.memberId);
    expect(second.wasAlreadyThere).toBe(true);

    await database.destroy();
  });
  it("rolls back a new identity and settings when its name is already claimed", async () => {
    const database = await _freshDatabase();
    const options = {
      database,
      email: "first@example.com",
      displayName: "Permanent Name",
      role: "viewer" as const,
      baseUrl: "http://localhost:38473",
    };
    const first = await seedMember(options);
    await expect(
      seedMember({
        ...options,
        email: "second@example.com",
        displayName: "PERMANENT NAME",
      }),
    ).rejects.toMatchObject({ code: "name_taken" });
    expect(await database.selectFrom("members").select("id").execute()).toEqual(
      [{ id: first.memberId }],
    );
    const repeated = await seedMember({
      ...options,
      displayName: "Ignored Replacement",
      role: "admin",
    });
    expect(repeated.memberId).toBe(first.memberId);
    expect(
      await database
        .selectFrom("members")
        .select(["display_name", "role"])
        .executeTakeFirstOrThrow(),
    ).toEqual({ display_name: "Permanent Name", role: "viewer" });
    await database.destroy();
  });
});

describe("getSeedArgumentsFromArgv", () => {
  it("defaults the role and base URL when an address and name are given", () => {
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "abuela@example.com",
      ]),
    ).toEqual({
      email: "abuela@example.com",
      displayName: "Abuela Rosa",
      role: "admin",
      baseUrl: "http://localhost:38473",
    });
  });

  it("takes both flags, in either order, before or after the address", () => {
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "--role",
        "viewer",
        "abuela@example.com",
        "--base-url",
        "https://shoebox.example",
      ]),
    ).toEqual({
      email: "abuela@example.com",
      displayName: "Abuela Rosa",
      role: "viewer",
      baseUrl: "https://shoebox.example",
    });
  });

  // The defect this was written for: `viwer` type-checked, and the refusal
  // arrived as a SQLite constraint on `members.role` several statements later,
  // naming the column rather than the flag that was mistyped.
  it("refuses a role that is not one of the three", () => {
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "abuela@example.com",
        "--role",
        "viwer",
      ]),
    ).toBeUndefined();
  });

  it("accepts each of the three roles", () => {
    for (const role of MEMBER_ROLES) {
      expect(
        getSeedArgumentsFromArgv([
          "--display-name",
          "Abuela Rosa",
          "abuela@example.com",
          "--role",
          role,
        ]),
      ).toEqual({
        email: "abuela@example.com",
        displayName: "Abuela Rosa",
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
        "--display-name",
        "Abuela Rosa",
        "abuela@example.com",
        "--role",
        "--base-url",
        "https://shoebox.example",
      ]),
    ).toBeUndefined();
  });

  it("refuses a flag with nothing after it at all", () => {
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "abuela@example.com",
        "--role",
      ]),
    ).toBeUndefined();
  });

  // A flag's value belongs to its flag. The old reader found the address by
  // taking the first word that did not start with `--`, which here is
  // `viewer`, and seeded a member at the address "viewer".
  it("does not mistake a flag's value for the address", () => {
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "--role",
        "viewer",
        "abuela@example.com",
      ]),
    ).toEqual({
      email: "abuela@example.com",
      displayName: "Abuela Rosa",
      role: "viewer",
      baseUrl: "http://localhost:38473",
    });
  });

  it("refuses an empty command line, an unknown flag, and two addresses", () => {
    expect(
      getSeedArgumentsFromArgv(["--display-name", "Abuela Rosa"]),
    ).toBeUndefined();
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "abuela@example.com",
        "--admin",
      ]),
    ).toBeUndefined();
    expect(
      getSeedArgumentsFromArgv([
        "--display-name",
        "Abuela Rosa",
        "abuela@example.com",
        "tio@example.com",
      ]),
    ).toBeUndefined();
  });
  it("requires an explicit valid account name", () => {
    for (const args of [
      ["rosa@example.com"],
      ["rosa@example.com", "--display-name", ""],
      ["rosa@example.com", "--display-name", "bad@name"],
    ])
      expect(getSeedArgumentsFromArgv(args)).toBeUndefined();
  });
});

describe("seed member command", () => {
  it("shows help before invalid flags or database access, outside the repository", () => {
    const directory = mkdtempSync(join(tmpdir(), "seed-help-"));
    const script = fileURLToPath(
      new URL("../scripts/seedMember.ts", import.meta.url),
    );
    try {
      for (const flag of ["-h", "--help"]) {
        const child = spawnSync(process.execPath, [script, "--invalid", flag], {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_PATH: join(directory, "absent", "catalog.db"),
            NO_COLOR: "1",
            TERM: "dumb",
          },
        });
        expect(child.status).toBe(0);
        expect(child.stdout).toContain("--display-name <name>");
        expect(child.stdout).not.toContain("\u001b[");
        expect(child.stderr).toBe("");
        expect(existsSync(join(directory, "absent"))).toBe(false);
      }
      const invalid = spawnSync(
        process.execPath,
        [script, "rosa@example.com"],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_PATH: join(directory, "absent", "catalog.db"),
          },
        },
      );
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toBe("");
      expect(invalid.stderr).toContain("Usage:");
      expect(invalid.stderr).toContain("\n  ⚠️ Try pnpm seed:member");
      expect(existsSync(join(directory, "absent"))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("keeps seed and backup progress on stderr while stdout contains one result", () => {
    const directory = mkdtempSync(join(tmpdir(), "seed-output-"));
    const script = fileURLToPath(
      new URL("../scripts/seedMember.ts", import.meta.url),
    );
    try {
      const child = spawnSync(
        process.execPath,
        [script, "seeded@example.com", "--display-name", "Seeded Name"],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_PATH: join(directory, "catalog.db"),
            NO_COLOR: "1",
          },
        },
      );
      expect(child.status).toBe(0);
      expect(child.stdout.trim().split("\n")).toHaveLength(1);
      expect(child.stdout).toContain("seeded@example.com is now a member");
      expect(child.stderr).toContain("Seeding local member");
      expect(child.stderr).toContain("Pre-migration backup:");
      expect(child.stderr).toContain("✅ Local member ready.");
      expect(child.stderr).not.toContain("\u001b[");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
