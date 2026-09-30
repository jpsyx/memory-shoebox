// apps/server/scripts/seedArchive.ts
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createB2Client } from "../src/b2/client.ts";
import { getConfig } from "../src/config.ts";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { seedMember, type SeededMember } from "./seedMember.ts";
import {
  writeArchivePlan,
  type WrittenArchive,
} from "./archiveSeed/writeArchivePlan.ts";

/**
 * Writes a development archive: days, bursts, milestones, tags, people and
 * views, plus the cartoon objects the prints draw.
 *
 * **This exists because uploading does not yet.** The upload session is step
 * 7b's, so until it lands there is no route that creates an item and therefore
 * no pile to look at, nothing to compare against a prototype, and nothing for
 * an end-to-end test to find. It is a development tool: it is not reachable
 * over HTTP and the server does not import it.
 *
 * `--no-objects` skips the bucket entirely, which is what the end-to-end run
 * uses: its B2 credentials are placeholders that could not reach Backblaze, the
 * URLs still sign in process, and the images simply do not load. Every DOM
 * assertion, every count and the contrast sweep are unaffected, because none of
 * them is a picture.
 *
 * Usage:
 *   pnpm seed:archive --as abuela@example.com
 *   pnpm seed:archive --as abuela@example.com --no-objects
 */

/** Where the generated cartoon files are read from. */
const DEFAULT_MEDIA_DIRECTORY = fileURLToPath(
  new URL("../../../prototypes/public/media/web/", import.meta.url),
);

/**
 * The second member: a viewer, in no group, so the restricted items really are
 * invisible to somebody.
 *
 * An admin sees everything (`src/visibility/applyVisibilityFilter.ts`), so a
 * restricted item is only restricted from somebody who is not one. Without this
 * member the lock chip, the zero-count tag and the two degenerate bursts are
 * all unobservable.
 */
const VIEWER_EMAIL = "prima@example.com";

/**
 * How many objects are uploaded at once. Small files, so the limit is
 * latency.
 */
const UPLOAD_CONCURRENCY = 8;

/**
 * Uploads one object per storage key, reading the cartoon file named in it.
 *
 * `basename(key)` is safe because `writeArchivePlan` always shapes a key as
 * `seed/<item key>/<purpose>/<file>`: the last segment is exactly the cartoon
 * file's own name, verified against `prototypes/public/media/web/` before this
 * was trusted.
 */
async function _uploadObjects(options: {
  storageKeys: readonly string[];
  mediaDirectory: string;
}): Promise<void> {
  const config = getConfig();
  const b2 = createB2Client(config.b2);
  const keys = [...options.storageKeys];
  let uploaded = 0;

  const _drainOne = async (): Promise<void> => {
    for (;;) {
      const key = keys.shift();
      if (key === undefined) {
        return;
      }
      const file = basename(key);
      const body = readFileSync(join(options.mediaDirectory, file));
      await b2.putObject({
        key,
        body: new Uint8Array(body),
        contentType: file.endsWith(".mp4")
          ? "video/mp4"
          : file.endsWith(".webm")
            ? "video/webm"
            : "image/jpeg",
      });
      uploaded += 1;
      if (uploaded % 50 === 0) {
        process.stdout.write(`${uploaded} objects\n`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: UPLOAD_CONCURRENCY }, () => {
      return _drainOne();
    }),
  );
}

/** The one line printed whenever the arguments do not make sense. */
export const SEED_ARCHIVE_USAGE =
  "Usage: pnpm seed:archive --as <address> [--no-objects] [--media-dir <path>]";

/** Everything the script needs, read from the command line. */
export type SeedArchiveArguments = {
  email: string;
  withObjects: boolean;
  mediaDirectory: string;
};

/**
 * Reads the command line, or refuses it.
 *
 * One walk rather than an `indexOf` per flag, for the reasons
 * `seedMember.ts`'s own reader spells out: a flag's value is consumed by its
 * flag and can never be mistaken for the address.
 */
export function getSeedArchiveArgumentsFromArgv(
  argv: readonly string[],
): SeedArchiveArguments | undefined {
  let email: string | undefined = undefined;
  let withObjects = true;
  let mediaDirectory = DEFAULT_MEDIA_DIRECTORY;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    const value = argv[index + 1];
    if (argument === "--no-objects") {
      withObjects = false;
    } else if (argument === "--as" || argument === "--media-dir") {
      if (value === undefined || value.startsWith("--")) {
        return undefined;
      }
      if (argument === "--as") {
        email = value;
      } else {
        mediaDirectory = value;
      }
      index += 1;
    } else {
      return undefined;
    }
  }

  return email === undefined
    ? undefined
    : { email, withObjects, mediaDirectory };
}

/**
 * Seeds the two members the archive needs: the uploader named on the command
 * line, and the fixed viewer who is never added to the restricted group.
 */
async function _seedMembers(options: {
  database: ReturnType<typeof createDatabase>;
  email: string;
}): Promise<{ uploader: SeededMember; viewer: SeededMember }> {
  const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:5173";
  const uploader = await seedMember({
    database: options.database,
    email: options.email,
    role: "admin",
    baseUrl,
  });
  const viewer = await seedMember({
    database: options.database,
    email: VIEWER_EMAIL,
    role: "viewer",
    baseUrl,
  });
  return { uploader, viewer };
}

/** Prints the one summary line the script ends with. */
function _printSummary(options: {
  written: WrittenArchive;
  uploader: SeededMember;
  viewer: SeededMember;
  withObjects: boolean;
}): void {
  const { written, uploader, viewer, withObjects } = options;
  process.stdout.write(
    `${written.itemCount} items across ${written.dayCount} days, ` +
      `uploaded by ${uploader.email}, seen in part by ${viewer.email}` +
      `${withObjects ? "" : ", objects skipped"}\n`,
  );
}

/** Runs the script when it is executed rather than imported. */
async function _main(): Promise<void> {
  const seedArguments = getSeedArchiveArgumentsFromArgv(process.argv.slice(2));
  if (seedArguments === undefined) {
    process.stderr.write(`${SEED_ARCHIVE_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const database = createDatabase(
    process.env.DATABASE_PATH ?? "./data/memory-shoebox.db",
  );
  await migrateToLatest(database);

  const { uploader, viewer } = await _seedMembers({
    database,
    email: seedArguments.email,
  });
  const written = await writeArchivePlan({
    database,
    uploaderMemberId: uploader.memberId,
    viewerMemberId: viewer.memberId,
  });
  await database.destroy();

  if (seedArguments.withObjects) {
    await _uploadObjects({
      storageKeys: written.storageKeys,
      mediaDirectory: seedArguments.mediaDirectory,
    });
  }

  _printSummary({
    written,
    uploader,
    viewer,
    withObjects: seedArguments.withObjects,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
