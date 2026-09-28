import type { Kysely } from "kysely";
import { createDatabase } from "../src/db/client.ts";
import { createId } from "../src/db/createId.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import type { Database } from "../src/db/types/db.types.ts";

/**
 * Makes a member who can sign in, for local development and the end-to-end
 * run.
 *
 * **This exists because inviting does not yet.** The invitation lifecycle is
 * step 8a's, so until it lands there is no route that creates a member and
 * therefore nothing to sign in as. It is a development tool: it is not
 * reachable over HTTP, it is not imported by the server, and step 8a is where
 * it stops being needed.
 *
 * `status` is `invited` rather than `active` because that is what an invited
 * address really is, and because accepting an invitation is defined as the
 * first successful sign-in: `POST /api/auth/session` sets `joined_at` and
 * flips the status itself (Decision 2). Seeding `active` would skip the one
 * transition the first sign-in exists to make, and `isFirstSignIn` would come
 * back false on a member who has never signed in.
 */
export type SeededMember = {
  memberId: string;
  email: string;
  /** True when the address already had a member, which is not an error. */
  wasAlreadyThere: boolean;
};

/** What the script needs to make somebody who can sign in. */
export type SeedMemberOptions = {
  database: Kysely<Database>;
  email: string;
  role: "viewer" | "uploader" | "admin";
  /**
   * Written to `public.base_url` when that setting is unset.
   *
   * Not optional, and not cosmetic. `enqueueEmail` writes a `sign_in_code`
   * row already scrubbed when `public.base_url` is missing, so a Shoebox
   * without it queues sign-in codes whose digits are gone before anybody can
   * read them.
   */
  baseUrl: string;
};

/**
 * Seeds one member and the one setting a sign-in code needs.
 *
 * @param options.database An open, migrated database.
 * @param options.email The address, normalised here exactly as the API
 *   normalises it, so the seeded row is the row a sign-in finds.
 * @param options.role The member's role.
 * @param options.baseUrl Written to `public.base_url` if it is unset.
 * @returns The member, and whether it already existed.
 */
export async function seedMember(
  options: SeedMemberOptions,
): Promise<SeededMember> {
  const { database, role, baseUrl } = options;
  const email = options.email.trim().toLowerCase();
  const now = new Date().toISOString();

  await database
    .insertInto("settings")
    .values({
      id: createId(),
      scope: "instance",
      scope_id: null,
      key: "public.base_url",
      value: JSON.stringify(baseUrl),
      updated_at: now,
      updated_by_member_id: null,
    })
    .onConflict((conflict) => {
      return conflict.doNothing();
    })
    .execute();

  const existing = await database
    .selectFrom("members")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  if (existing !== undefined) {
    return { memberId: existing.id, email, wasAlreadyThere: true };
  }

  const memberId = createId();
  await database
    .insertInto("members")
    .values({
      id: memberId,
      email,
      display_name: null,
      role,
      status: "invited",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: null,
      last_signed_in_at: null,
      last_seen_at: null,
      removed_at: null,
      created_at: now,
    })
    .execute();

  return { memberId, email, wasAlreadyThere: false };
}

/** Reads `--role` and `--base-url`, both optional, from a bare argument list. */
function _readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

/** Runs the script when it is executed rather than imported. */
async function _main(): Promise<void> {
  const argv = process.argv.slice(2);
  const email = argv.find((argument) => {
    return !argument.startsWith("--");
  });
  if (email === undefined) {
    process.stderr.write(
      "Usage: pnpm seed:member <address> [--role admin] [--base-url http://localhost:5173]\n",
    );
    process.exitCode = 1;
    return;
  }

  const database = createDatabase(
    process.env.DATABASE_PATH ?? "./data/memory-shoebox.db",
  );
  await migrateToLatest(database);
  const seeded = await seedMember({
    database,
    email,
    role: (_readFlag(argv, "role") ?? "admin") as SeedMemberOptions["role"],
    baseUrl: _readFlag(argv, "base-url") ?? "http://localhost:5173",
  });
  await database.destroy();

  process.stdout.write(
    seeded.wasAlreadyThere
      ? `${seeded.email} was already a member (${seeded.memberId})\n`
      : `${seeded.email} is now a member (${seeded.memberId})\n`,
  );
}

// `import.meta.main` is true only when Node was pointed at this file, so
// importing it from a test runs nothing. Available from Node 24, which this
// project requires.
if (import.meta.main === true) {
  await _main();
}
