import { mkdtempSync } from "node:fs";

import { tmpdir } from "node:os";

import { join } from "node:path";

import { fileURLToPath } from "node:url";

/** This directory, which is where every fixture is written. */
export const FIXTURE_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));

/**
 * Temporary workspace for fixture generation, removed after the run.
 */
export const scratchDirectory = mkdtempSync(join(tmpdir(), "upload-fixtures-"));
