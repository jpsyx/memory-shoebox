import { claimMemberName } from "../src/members/claimMemberName.ts";
import {
  accountNameSchema,
  normalisedEmailSchema,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../src/db/runInImmediateTransaction.ts";
import { fileURLToPath } from "node:url";
import { openSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { ReadStream, WriteStream } from "node:tty";
import type { Kysely } from "kysely";
import { createDatabase } from "../src/db/client.ts";
import { createId } from "../src/db/createId.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import type { Database } from "../src/db/types/db.types.ts";

/** A local seeded identity, invited until its first successful sign-in. */
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
  displayName: string;
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

async function _insertSeededMember(
  options: Readonly<{
    database: Kysely<Database>;
    memberId: string;
    email: string;
    role: MemberRole;
    now: string;
  }>,
): Promise<void> {
  await options.database
    .insertInto("members")
    .values({
      id: options.memberId,
      email: options.email,
      display_name: null,
      role: options.role,
      status: "invited",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: null,
      last_signed_in_at: null,
      last_seen_at: null,
      removed_at: null,
      created_at: options.now,
    })
    .execute();
}

/**
 * Seeds one member and the one setting a sign-in code needs.
 *
 * @param options.database An open, migrated database.
 * @param options.email The address, normalised here exactly as the API
 *   normalises it, so the seeded row is the row a sign-in finds.
 * @param options.displayName The explicit unique account name to claim.
 * @param options.role The member's role.
 * @param options.baseUrl Written to `public.base_url` if it is unset.
 * @returns The member, and whether it already existed.
 */
export async function seedMember(
  options: SeedMemberOptions,
): Promise<SeededMember> {
  const email = normalisedEmailSchema.parse(options.email);
  const displayName = accountNameSchema.parse(options.displayName);
  const now = new Date().toISOString();
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const existing = await transaction
        .selectFrom("members")
        .select(["id", "display_name", "profile_completed_at"])
        .where("email", "=", email)
        .executeTakeFirst();
      const memberId = existing?.id ?? createId();
      if (!existing)
        await _insertSeededMember({
          database: transaction,
          memberId,
          email,
          role: options.role,
          now,
        });
      await claimMemberName({
        transaction,
        memberId,
        displayName: existing?.profile_completed_at
          ? (existing.display_name ?? displayName)
          : displayName,
        now,
      });
      await _writeBaseUrlIfUnset({
        database: transaction,
        baseUrl: options.baseUrl,
        now,
      });
      return { memberId, email, wasAlreadyThere: existing !== undefined };
    },
  });
}

/** Full help, shared by help and invalid invocations. */
export const SEED_MEMBER_USAGE = `Seed a local member with a claimed account name.
Usage: pnpm seed:member <address> --display-name <name> [--role viewer|uploader|admin] [--base-url <url>]

Arguments:
  <address>            Email address used to sign in.
Options:
  --display-name <name> Required unique account name, 1-80 characters.
  --role              viewer, uploader, or admin (default: admin).
  --base-url          Public sign-in URL (default: http://localhost:38473).
  -h, --help          Show this help without opening a database.
Existing claimed accounts retain their name and role. Missing address/name prompts
on a terminal; unattended invocations must supply both. Output: one member result
line on stdout; progress and diagnostics on stderr.

Examples:
  pnpm seed:member rosa@example.com --display-name "Rosa"
  pnpm seed:member ana@example.com --display-name "Ana M" --role viewer`;

/** The flags that take a following word, as opposed to standing alone. */
const VALUED_FLAGS = ["--role", "--base-url", "--display-name"] as const;

/** Whether a word off the command line is one of the three roles. */
function _isMemberRole(value: string): value is MemberRole {
  return MEMBER_ROLES.some((role) => {
    return role === value;
  });
}

/** Everything `seedMember` needs except the database, read from the command line. */
export type SeedMemberArguments = Omit<SeedMemberOptions, "database">;

type PartialSeedArguments = Omit<
  SeedMemberArguments,
  "email" | "displayName"
> & {
  email?: string;
  displayName?: string;
};

function _getPartialArgumentsFromArgv(
  argv: readonly string[],
): PartialSeedArguments | undefined {
  const parsed: PartialSeedArguments = {
    role: "admin",
    baseUrl: "http://localhost:38473",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (
      VALUED_FLAGS.some((flag) => {
        return flag === argument;
      })
    ) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      if (argument === "--display-name") parsed.displayName = value;
      else if (argument === "--base-url") parsed.baseUrl = value;
      else if (_isMemberRole(value)) parsed.role = value;
      else return undefined;
      index += 1;
    } else if (argument.startsWith("-") || parsed.email !== undefined)
      return undefined;
    else parsed.email = argument;
  }
  return parsed;
}

/** Parse explicit seed arguments, requiring a valid address and chosen name. */
export function getSeedArgumentsFromArgv(
  argv: readonly string[],
): SeedMemberArguments | undefined {
  const parsed = _getPartialArgumentsFromArgv(argv);
  if (!parsed?.email || !normalisedEmailSchema.safeParse(parsed.email).success)
    return undefined;
  const name = accountNameSchema.safeParse(parsed.displayName);
  if (!name.success) return undefined;
  return { ...parsed, email: parsed.email, displayName: name.data };
}

/** Semantic colors are disabled for redirected streams and plain terminals. */
const THEME = {
  heading: "97",
  info: "36",
  success: "32",
  error: "31",
  warning: "33",
  prompt: "97",
} as const;
function _color(
  message: string,
  kind: keyof typeof THEME,
  stream: NodeJS.WriteStream = process.stderr,
): string {
  return stream.isTTY &&
    !process.env["NO_COLOR"] &&
    process.env["TERM"] !== "dumb"
    ? `\u001b[${THEME[kind]}m${message}\u001b[0m`
    : message;
}
function _writeDiagnostic(message: string, kind: keyof typeof THEME): void {
  process.stderr.write(`${_color(message, kind)}\n`);
}

async function _getArgumentsFromTerminalOrArgv(
  argv: readonly string[],
): Promise<SeedMemberArguments | undefined> {
  const explicit = getSeedArgumentsFromArgv(argv);
  const parsed = _getPartialArgumentsFromArgv(argv);
  if (explicit || !parsed || (!process.stdin.isTTY && !process.stderr.isTTY))
    return explicit;
  if (parsed.email !== undefined && parsed.displayName !== undefined)
    return undefined;
  const input = new ReadStream(openSync("/dev/tty", "r"));
  const output = new WriteStream(openSync("/dev/tty", "w"));
  const terminal = createInterface({ input, output, terminal: true });
  try {
    const email =
      parsed.email ??
      (await terminal.question(_color("Email address: ", "prompt", output)));
    const displayName =
      parsed.displayName ??
      (await terminal.question(_color("Account name: ", "prompt", output)));
    return getSeedArgumentsFromArgv([
      email,
      "--display-name",
      displayName,
      "--role",
      parsed.role,
      "--base-url",
      parsed.baseUrl,
    ]);
  } catch {
    return undefined;
  } finally {
    terminal.close();
    input.destroy();
    output.destroy();
  }
}

async function _seedFromArguments(
  seedArguments: SeedMemberArguments,
): Promise<SeededMember> {
  _writeDiagnostic("Seeding local member and account name...", "info");
  const database = createDatabase(
    process.env.DATABASE_PATH ?? "./data/memory-shoebox.db",
  );
  try {
    await migrateToLatest(database);
    return await seedMember({ database, ...seedArguments });
  } finally {
    await database.destroy();
  }
}

/** Runs the script when it is executed rather than imported. */
async function _main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      `${_color(SEED_MEMBER_USAGE, "heading", process.stdout)}\n`,
    );
    return;
  }
  const seedArguments = await _getArgumentsFromTerminalOrArgv(argv);
  if (seedArguments === undefined) {
    _writeDiagnostic(
      "❌ seed:member: Provide an address and a valid account name.",
      "error",
    );
    _writeDiagnostic(SEED_MEMBER_USAGE, "heading");
    _writeDiagnostic(
      '  ⚠️ Try pnpm seed:member rosa@example.com --display-name "Rosa".',
      "warning",
    );
    process.exitCode = 1;
    return;
  }

  const seeded = await _seedFromArguments(seedArguments);
  _writeDiagnostic("✅ Local member ready.", "success");

  process.stdout.write(
    seeded.wasAlreadyThere
      ? `${seeded.email} was already a member (${seeded.memberId})\n`
      : `${seeded.email} is now a member (${seeded.memberId})\n`,
  );
}

// Only run when invoked directly (`pnpm seed:member`), not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main().catch((error: unknown) => {
    _writeDiagnostic(
      `❌ seed:member: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
    _writeDiagnostic(
      "  ⚠️ Check the account name and database path, then retry.",
      "warning",
    );
    process.exit(1);
  });
}
