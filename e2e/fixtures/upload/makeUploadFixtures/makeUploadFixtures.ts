import { rmSync, writeFileSync } from "node:fs";

import { join } from "node:path";

import { writePhotoFixtures } from "./uploadPhotoFixtureHelpers.ts";

import { writeVideoFixtures } from "./writeVideoFixtures.ts";

import { makeMinimalPdf } from "./makeMinimalPdf.ts";

import {
  scratchDirectory,
  FIXTURE_DIRECTORY,
} from "./makeUploadFixtures.constants.ts";

try {
  writePhotoFixtures(scratchDirectory);
  writeVideoFixtures();
  writeFileSync(join(FIXTURE_DIRECTORY, "not-media.pdf"), makeMinimalPdf());
} finally {
  rmSync(scratchDirectory, { recursive: true, force: true });
}
