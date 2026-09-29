import { fileURLToPath } from "node:url";
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

/**
 * The three roles a member can have, which is also the whole of what `--role`
 * may name.
 *
 * It is a list rather than only a union because the command line hands over
 * strings, and something has to check one at runtime: `members.role` is a
 * `CHECK` constraint, so an unchecked cast turns a typo into a SQLite error
 * several statements later, naming the constraint rather than the flag.
 */
export const MEMBER_ROLES = ["viewer", "uploader", "admin"] as const;

/** One of the three roles `members.role` allows. */
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** What the script needs to make somebody who can sign in. */
export type SeedMemberOptions = {
  database: Kysely<Database>;
  email: string;
  role: MemberRole;
  /** Written to `public.base_url` when that setting is unset. Not optional
   * and not cosmetic: see `_writeBaseUrlIfUnset` for why. */
  baseUrl: string;
};

/**
 * Writes `public.base_url` when it is unset. A no-op on every later call.
 *
 * Not incidental: `enqueueEmail` writes a `sign_in_code` row already scrubbed
 * when `public.base_url` is missing, so a Shoebox without it queues sign-in
 * codes whose digits are gone before anybody can read them.
 */
async function _writeBaseUrlIfUnset(options: {
  database: Kysely<Database>;
  baseUrl: string;
  now: string;
}): Promise<void> {
  await options.database
    .insertInto("settings")
    .values({
      id: createId(),
      scope: "instance",
      scope_id: null,
      key: "public.base_url",
      value: JSON.stringify(options.baseUrl),
      updated_at: options.now,
      updated_by_member_id: null,
    })
    .onConflict((conflict) => {
      return conflict.doNothing();
    })
    .execute();
}

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

  await _writeBaseUrlIfUnset({ database, baseUrl, now });

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

/** The one line printed whenever the arguments do not make sense. */
export const SEED_MEMBER_USAGE =
  "Usage: pnpm seed:member <address> [--role viewer|uploader|admin] " +
  "[--base-url http://localhost:5173]";

/** The flags that take a following word, as opposed to standing alone. */
const VALUED_FLAGS = ["--role", "--base-url"] as const;

/** Whether a word off the command line is one of the three roles. */
function _isMemberRole(value: string): value is MemberRole {
  return MEMBER_ROLES.some((role) => {
    return role === value;
  });
}

/** Everything `seedMember` needs except the database, read from the command line. */
export type SeedMemberArguments = Omit<SeedMemberOptions, "database">;

/**
 * Reads the command line, or refuses it.
 *
 * **One walk rather than an `indexOf` per flag**, which is what makes two
 * defects structurally impossible rather than merely absent. Do not read a
 * flag's value as whatever word follows it: `--role --base-url x` then takes
 * `--base-url` as the role. Do not read the address as the first word that
 * does not start with `--`: in `--role viewer abuela@example.com` that is
 * `viewer`. Walking the list means a flag's value is consumed by its flag and
 * can never be mistaken for anything else.
 *
 * The role is checked against `MEMBER_ROLES` here, where the flag it came from
 * can still be named. Cast unchecked, `--role viwer` type-checks and dies on
 * the `members.role` constraint, which says nothing about a typed flag.
 *
 * @param argv The arguments after the script's own name.
 * @returns What to seed, or undefined when the caller should print
 *   `SEED_MEMBER_USAGE` and stop.
 */
export function getSeedArgumentsFromArgv(
  argv: readonly string[],
): SeedMemberArguments | undefined {
  let email: string | undefined = undefined;
  let role: MemberRole = "admin";
  let baseUrl = "http://localhost:5173";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    const value = argv[index + 1];
    if (
      VALUED_FLAGS.some((flag) => {
        return flag === argument;
      })
    ) {
      // A flag at the end of the list, or followed by another flag, was given
      // no value at all, whatever the person meant by it.
      if (value === undefined || value.startsWith("--")) {
        return undefined;
      }
      if (argument === "--base-url") {
        baseUrl = value;
      } else if (_isMemberRole(value)) {
        role = value;
      } else {
        return undefined;
      }
      index += 1;
    } else if (argument.startsWith("--") || email !== undefined) {
      // An unknown flag, or a second address. Either way this is not a command
      // line anybody meant to type.
      return undefined;
    } else {
      email = argument;
    }
  }

  return email === undefined ? undefined : { email, role, baseUrl };
}

/** Runs the script when it is executed rather than imported. */
async function _main(): Promise<void> {
  const seedArguments = getSeedArgumentsFromArgv(process.argv.slice(2));
  if (seedArguments === undefined) {
    process.stderr.write(`${SEED_MEMBER_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const database = createDatabase(
    process.env.DATABASE_PATH ?? "./data/memory-shoebox.db",
  );
  await migrateToLatest(database);
  const seeded = await seedMember({ database, ...seedArguments });
  await database.destroy();

  process.stdout.write(
    seeded.wasAlreadyThere
      ? `${seeded.email} was already a member (${seeded.memberId})\n`
      : `${seeded.email} is now a member (${seeded.memberId})\n`,
  );
}

// Only run when invoked directly (`pnpm seed:member`), not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
