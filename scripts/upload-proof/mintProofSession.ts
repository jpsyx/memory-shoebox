import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalisedEmailSchema } from "@memory-shoebox/shared";
import { createSessionForMember } from "../../apps/server/src/auth/createSessionForMember";
import { parseConfig } from "../../apps/server/src/config";
import { createDatabase } from "../../apps/server/src/db/client";

/**
 * The catalog handle, named by what makes it rather than as `Kysely<...>`:
 * `kysely` is the server's dependency, not the root's, so the root cannot
 * name it. `e2e/support/database.ts` does the same.
 */
type Catalog = ReturnType<typeof createDatabase>;

/**
 * The server package's directory, where `pnpm dev` runs the API and where a
 * relative `DATABASE_PATH` is therefore relative to. Found from this file,
 * because this script runs from the repository root and the API does not.
 */
const SERVER_DIRECTORY = fileURLToPath(
  new URL("../../apps/server/", import.meta.url),
);

/** A minted session: the cookie value, whose it is, and how to end it. */
export type ProofSession = {
  memberEmail: string;
  token: string;
  /** Deletes the session row and closes the catalog. Call it once, last. */
  end: () => Promise<void>;
};

/** The member a proof signs in as: by address, or the first active admin. */
async function _findMember(options: {
  database: Catalog;
  memberEmail: string | undefined;
}): Promise<{ id: string; email: string }> {
  const query = options.database
    .selectFrom("members")
    .select(["id", "email", "role", "status"]);
  const member =
    options.memberEmail === undefined
      ? await query
          .where("role", "=", "admin")
          .where("status", "=", "active")
          .orderBy("created_at")
          .executeTakeFirst()
      : await query
          .where("email", "=", normalisedEmailSchema.parse(options.memberEmail))
          .executeTakeFirst();
  if (member === undefined) {
    throw new Error(
      options.memberEmail === undefined
        ? "No active admin in the development catalog. Sign in once through the app first."
        : `No member at ${options.memberEmail}.`,
    );
  }
  if (member.status !== "active") {
    throw new Error(
      `${member.email} has never signed in, so no session of theirs would work. Sign in once through the app first.`,
    );
  }
  if (member.role === "viewer") {
    throw new Error(`${member.email} is a viewer, and a viewer cannot upload.`);
  }
  return member;
}

/**
 * Mints a session for a member straight into the development catalog.
 *
 * The server's own pieces, so the session is exactly one sign-in would make:
 * `parseConfig` over the same `apps/server/.env.local` `pnpm dev` reads,
 * `createDatabase` on the same `DATABASE_PATH` resolved the way the API
 * resolves it, and `createSessionForMember` for the row and the token.
 *
 * **It refuses outside development.** Only a `NODE_ENV` of exactly
 * `development` or `test` passes, the same fail-closed reading
 * `isKnownNonProduction` gives fake email, because a command that writes a
 * session row for anybody it is told to must never meet a real Shoebox.
 *
 * @param options.memberEmail Whose session; undefined for the first admin.
 */
export async function mintProofSession(
  options: Readonly<{ memberEmail: string | undefined }>,
): Promise<ProofSession> {
  const envPath = join(SERVER_DIRECTORY, ".env.local");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  const config = parseConfig(process.env);
  if (!config.isKnownNonProduction) {
    throw new Error(
      `Refusing to run: NODE_ENV is ${process.env.NODE_ENV ?? "unset"}. pnpm upload:proof mints sessions straight into the catalog, so it runs only where NODE_ENV is exactly development or test.`,
    );
  }
  const database = createDatabase(
    resolve(SERVER_DIRECTORY, config.databasePath),
  );
  try {
    const member = await _findMember({ database, ...options });
    const session = await createSessionForMember({
      transaction: database,
      memberId: member.id,
      userAgent: "pnpm upload:proof",
      now: new Date().toISOString(),
    });
    return {
      memberEmail: member.email,
      token: session.token,
      end: async () => {
        await database
          .deleteFrom("sessions")
          .where("id", "=", session.sessionId)
          .execute();
        await database.destroy();
      },
    };
  } catch (error: unknown) {
    await database.destroy();
    throw error;
  }
}
