import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedMember } from "../../../apps/server/scripts/seedMember";
import { makeTokenHashFromToken } from "../../../apps/server/src/auth/sessionToken";
import { createDatabase } from "../../../apps/server/src/db/client";
import { migrateToLatest } from "../../../apps/server/src/db/migrate";
import { mintProofSession } from "./mintProofSessionHelpers";

/** Every variable the server's configuration needs, for a development run. */
const ENV = {
  NODE_ENV: "development",
  DATABASE_PATH: "catalog.db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  B2_KEY_ID: "key",
  B2_APPLICATION_KEY: "secret",
  B2_BUCKET: "bucket",
  B2_ENDPOINT: "https://b2.test",
  B2_REGION: "region",
};

describe("mintProofSession", () => {
  let serverDirectory: string;

  // A migrated catalog at `catalog.db`, with these members, never the real one.
  const _seedCatalog = async (
    members: ReadonlyArray<{
      email: string;
      role: "viewer" | "uploader" | "admin";
      status: "invited" | "active";
    }>,
  ): Promise<void> => {
    const database = createDatabase(join(serverDirectory, "catalog.db"));
    await migrateToLatest(database);
    await members.reduce(async (previous, member) => {
      await previous;
      const seeded = await seedMember({
        database,
        email: member.email,
        role: member.role,
        baseUrl: "http://localhost:5173",
      });
      await database
        .updateTable("members")
        .set({ status: member.status })
        .where("id", "=", seeded.memberId)
        .execute();
    }, Promise.resolve());
    await database.destroy();
  };

  // The `token_hash` of every session row in the catalog.
  const _readSessionTokenHashes = async (): Promise<string[]> => {
    const database = createDatabase(join(serverDirectory, "catalog.db"));
    const rows = await database
      .selectFrom("sessions")
      .select("token_hash")
      .execute();
    await database.destroy();
    return rows.map((row) => {
      return row.token_hash;
    });
  };

  beforeEach(() => {
    serverDirectory = mkdtempSync(join(tmpdir(), "upload-proof-mint-"));
  });

  afterEach(() => {
    rmSync(serverDirectory, { recursive: true, force: true });
  });

  it("signs in as the first active admin, with a row the server would recognise, and ends it", async () => {
    await _seedCatalog([
      { email: "invited@example.com", role: "admin", status: "invited" },
      { email: "viewer@example.com", role: "viewer", status: "active" },
      { email: "abuela@example.com", role: "admin", status: "active" },
    ]);

    const session = await mintProofSession({
      memberEmail: undefined,
      env: ENV,
      serverDirectory,
    });

    expect(session.memberEmail).toBe("abuela@example.com");
    expect(await _readSessionTokenHashes()).toEqual([
      makeTokenHashFromToken(session.token),
    ]);

    await session.end();

    expect(await _readSessionTokenHashes()).toEqual([]);
  });

  it("finds a named member however the address is written, an uploader included", async () => {
    await _seedCatalog([
      { email: "tia@example.com", role: "uploader", status: "active" },
    ]);

    const session = await mintProofSession({
      memberEmail: " Tia@Example.com ",
      env: ENV,
      serverDirectory,
    });

    expect(session.memberEmail).toBe("tia@example.com");
    await session.end();
  });

  it("refuses a viewer, a member who has never signed in, and a stranger, writing no session", async () => {
    await _seedCatalog([
      { email: "viewer@example.com", role: "viewer", status: "active" },
      { email: "invited@example.com", role: "admin", status: "invited" },
    ]);
    const mint = (memberEmail: string | undefined): Promise<unknown> => {
      return mintProofSession({ memberEmail, env: ENV, serverDirectory });
    };

    await expect(mint("viewer@example.com")).rejects.toThrow(
      "viewer@example.com is a viewer, and a viewer cannot upload.",
    );
    await expect(mint("invited@example.com")).rejects.toThrow(
      /invited@example.com has never signed in/,
    );
    await expect(mint("nobody@example.com")).rejects.toThrow(
      "No member at nobody@example.com.",
    );
    await expect(mint(undefined)).rejects.toThrow(
      /No active admin in the development catalog/,
    );
    expect(await _readSessionTokenHashes()).toEqual([]);
  });

  it.each([
    ["production", { NODE_ENV: "production" }, "production"],
    ["unset", { NODE_ENV: undefined }, "unset"],
    ["a near miss", { NODE_ENV: "Development" }, "Development"],
  ])("refuses to run when NODE_ENV is %s", async (_name, override, shown) => {
    await _seedCatalog([
      { email: "abuela@example.com", role: "admin", status: "active" },
    ]);

    await expect(
      mintProofSession({
        memberEmail: undefined,
        env: { ...ENV, ...override },
        serverDirectory,
      }),
    ).rejects.toThrow(new RegExp(`Refusing to run: NODE_ENV is ${shown}\\.`));
    expect(await _readSessionTokenHashes()).toEqual([]);
  });

  it("runs where NODE_ENV is test", async () => {
    await _seedCatalog([
      { email: "abuela@example.com", role: "admin", status: "active" },
    ]);

    const session = await mintProofSession({
      memberEmail: undefined,
      env: { ...ENV, NODE_ENV: "test" },
      serverDirectory,
    });

    await session.end();
  });

  it("refuses a catalog that is not there, and creates neither it nor its folder", async () => {
    const missing = join(serverDirectory, "elsewhere", "missing.db");

    await expect(
      mintProofSession({
        memberEmail: undefined,
        env: { ...ENV, DATABASE_PATH: "elsewhere/missing.db" },
        serverDirectory,
      }),
    ).rejects.toThrow(/No catalog at elsewhere\/missing\.db/);

    expect(existsSync(missing)).toBe(false);
    expect(existsSync(join(serverDirectory, "elsewhere"))).toBe(false);
  });
});
