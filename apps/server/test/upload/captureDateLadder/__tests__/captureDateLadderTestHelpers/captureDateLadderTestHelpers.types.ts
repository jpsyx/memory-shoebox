import type { ManifestCaptureEvidence } from "@memory-shoebox/shared";

import { type CaptureDateResult } from "../../../../../src/upload/captureDateLadderHelpers/captureDateLadderHelpers.types.ts";

/**
 * Capture evidence and the expected result for one ladder test case.
 */
export type LadderCase = {
  name: string;
  evidence?: ManifestCaptureEvidence;
  originalFilename?: string;
  timezone?: string;
  declaredAt?: string;
  expected: CaptureDateResult;
};
