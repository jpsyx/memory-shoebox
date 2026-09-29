import { rmSync } from "node:fs";
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
 * The write-ahead log and the shared-memory file go too. A stale `-wal` beside
 * a deleted `-shm` is a catalog with yesterday's committed rows still in it.
 */
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
}
