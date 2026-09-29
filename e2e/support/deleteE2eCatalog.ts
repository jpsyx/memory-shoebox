import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { E2E_DATABASE_PATH } from "./e2eEnvironment.ts";

/**
 * Throws the last run's catalog away, so every run begins with an empty
 * Shoebox and a specification that cannot depend on yesterday.
 *
 * **A script the web server command runs, and deliberately not Playwright's
 * `globalSetup`.** Playwright starts `webServer` and waits for its URL to
 * answer *before* it runs `globalSetup`, so a `globalSetup` that deleted this
 * file would delete it out from under a server that already had it open. On
 * macOS and Linux the server keeps writing to the unlinked inode and the next
 * handle on the path creates a fresh, empty file, so the specs would read an
 * empty catalog while the server served a full one. That failure was measured
 * rather than guessed.
 *
 * Running it as the first link of the web server command puts the deletion
 * back where it has to be: before anything opens the file. Node executes this
 * TypeScript directly, exactly as `apps/server` does.
 *
 * The module is import-safe: the deletion runs only when Node was pointed at
 * this file, because Playwright imports it for its `globalTeardown`, which is
 * the default export below.
 */

/** The lock file, beside the catalog it guards. */
const E2E_LOCK_PATH = `${E2E_DATABASE_PATH}.lock`;

/** Who holds the lock, as it is written to disk. */
type CatalogLockHolder = {
  /** The process that owns the run, not this short-lived script. */
  pid: number;
  startedAt: string;
};

/**
 * Longest a run may hold the lock before the next one calls it debris.
 *
 * The liveness check below is the real recovery and this is the backstop for
 * the one case it cannot see: a crashed run whose pid has since been handed
 * to some unrelated process. A whole end-to-end run is two or three minutes,
 * so half an hour is far outside anything legitimate.
 */
const LOCK_MAX_AGE_MS = 30 * 60 * 1000;

/** Whatever is in the lock file, or undefined if there is nothing usable. */
function _getHolderFromLockFile(): CatalogLockHolder | undefined {
  let contents: string;
  try {
    contents = readFileSync(E2E_LOCK_PATH, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(contents);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "pid" in parsed &&
      typeof (parsed as { pid: unknown }).pid === "number"
    ) {
      return parsed as CatalogLockHolder;
    }
  } catch {
    // A truncated or half-written lock says nothing about a live run, so it
    // is treated exactly as no lock at all rather than blocking every future
    // run until somebody deletes it by hand.
  }
  return undefined;
}

/**
 * Whether the run that wrote this lock is still going.
 *
 * `process.kill(pid, 0)` sends no signal: it asks the kernel whether the
 * process exists and whether we could signal it. An `EPERM` means it exists
 * and belongs to somebody else, which still counts as running.
 */
function _isTheHolderStillRunning(holder: CatalogLockHolder): boolean {
  const startedAtMs = Date.parse(holder.startedAt);
  if (
    !Number.isNaN(startedAtMs) &&
    Date.now() - startedAtMs > LOCK_MAX_AGE_MS
  ) {
    return false;
  }
  try {
    process.kill(holder.pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Refuses to start a second run over a live one.
 *
 * **Two overlapping runs corrupt each other and neither one says so.** The
 * deletion below unlinks the catalog under the first run's server, which goes
 * on writing to the unlinked inode while the second run's server migrates a
 * fresh file at the same path. Both then pass and fail against different
 * physical databases, and the errors read like anything except the cause.
 *
 * The recorded pid is `process.ppid`: the shell Playwright spawned the whole
 * `webServer` command on, which lives for exactly as long as the run and dies
 * with it. That is what makes a crashed run recoverable without anybody
 * having to know this file exists: the next run finds the pid gone and takes
 * the lock. `LOCK_MAX_AGE_MS` covers the remaining case, a pid the operating
 * system has since reissued.
 *
 * The write is exclusive (`wx`), so two runs starting in the same instant
 * cannot both believe they took it: one gets `EEXIST` and is turned away,
 * with a message for what actually happened rather than for a live run that
 * may not exist.
 */
function _takeTheCatalogLock(): void {
  const holder = _getHolderFromLockFile();
  if (holder !== undefined) {
    if (_isTheHolderStillRunning(holder)) {
      throw new Error(
        `Another end-to-end run is using this catalog: process ${holder.pid}, started ${holder.startedAt}. ` +
          "Wait for it to finish or stop it, then run again. " +
          `If no such run exists, delete ${E2E_LOCK_PATH}.`,
      );
    }
    // Debris from a run that crashed or was killed. Nothing holds the
    // catalog, so the lock is ours to take.
    rmSync(E2E_LOCK_PATH, { force: true });
  }

  const lock: CatalogLockHolder = {
    pid: process.ppid,
    startedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(E2E_LOCK_PATH, JSON.stringify(lock), { flag: "wx" });
  } catch {
    // Reaching here means somebody else created the lock between the read
    // above and this write. The commonest way that happens is not a live run
    // at all: it is two runs starting together, both finding the same dead
    // lock, and both clearing it, with the loser arriving a moment after the
    // winner took the name. Saying "another run is using this catalog" would
    // be a guess at which of those it was, so the message says only what is
    // certainly true.
    throw new Error(
      "Another process took this catalog's lock in the moment between reading it and " +
        `claiming it, so this run is stopping rather than sharing a catalog. ` +
        `Run again: if the other one is real, it will say so, and if it was two runs ` +
        `clearing the same dead lock together, the second attempt will succeed. ` +
        `The lock is ${E2E_LOCK_PATH}.`,
    );
  }
}

/**
 * Playwright's `globalTeardown`: gives the catalog back at the end of a run.
 *
 * Tidiness rather than correctness. A run that ends without reaching this,
 * because it crashed or was killed, leaves a lock whose pid is dead, and the
 * next run recognises that and takes it anyway. This only spares the reader
 * a file that looks like it means something when it does not.
 */
export default function releaseTheCatalogLock(): void {
  rmSync(E2E_LOCK_PATH, { force: true });
}

/**
 * Deletes the catalog, having first made sure no other run is using it.
 *
 * The write-ahead log and the shared-memory file go too. A stale `-wal`
 * beside a deleted `-shm` is a catalog with yesterday's committed rows still
 * in it.
 */
function _deleteTheCatalog(): void {
  _takeTheCatalogLock();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
  }
}

// Only when Node was pointed at this file, which is how the web server
// command runs it. Playwright imports the module for its `globalTeardown`
// and must not delete anything by doing so.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _deleteTheCatalog();
}
