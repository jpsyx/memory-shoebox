import { z } from "zod";

/*
 * The shape of a proof run as `pnpm upload:proof` reads it back from the
 * page. Zod and nothing else, on purpose: the root script imports this file
 * directly, and an `@/` import here would be one its compiler cannot follow.
 */

/** Where a run is. `held` waits for `release()` before the commit. */
export const UPLOAD_PROOF_PHASES = [
  "idle",
  "declaring",
  "held",
  "transferring",
  "finished",
  "failed",
] as const;

/** Where a run is. */
export type UploadProofPhase = (typeof UPLOAD_PROOF_PHASES)[number];

/**
 * How one picked file ended. `skipped` is a duplicate: the same bytes as
 * another file of the batch, whether presign cancelled it (design decision 15)
 * or the manifest matched it to the other file's row and the harness sent
 * that one only.
 */
export const PROOF_FILE_OUTCOMES = [
  "done",
  "failed",
  "skipped",
  "refused",
  "already_done",
  "not_sent",
] as const;

/** One picked file's row, filled in when the run ends. */
export const uploadProofFileSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  bytes: z.number().int().nonnegative(),
  outcome: z.enum(PROOF_FILE_OUTCOMES),
  problemCode: z.string().nullable(),
  /** Picked up to first byte on the wire: hash, derivatives, presign. */
  prepareMs: z.number().nonnegative().nullable(),
  /** First byte on the wire to `complete` answered. */
  transferMs: z.number().nonnegative().nullable(),
  /**
   * Picked up to `complete` answered. The one figure that never depends on
   * the browser reporting upload progress, which a tiny file may not get.
   */
  totalMs: z.number().nonnegative().nullable(),
  /** Whether the server answered `done` with media to draw. */
  hasMedia: z.boolean(),
});

/** One picked file's row. */
export type UploadProofFile = z.infer<typeof uploadProofFileSchema>;

/**
 * The part of the page's state `pnpm upload:proof` reads back, as JSON.
 *
 * Unknown keys are dropped, so the events and outcomes the end-to-end spec
 * reads cost the summary nothing.
 */
export const uploadProofReportSchema = z.object({
  phase: z.enum(UPLOAD_PROOF_PHASES),
  sessionId: z.string().nullable(),
  isResume: z.boolean(),
  error: z.string().nullable(),
  concurrency: z.number().int().positive(),
  userAgent: z.string(),
  wallMs: z.number().nonnegative().nullable(),
  /**
   * `performance.memory`, which only Chrome has. Null elsewhere. Coarse
   * without `--enable-precise-memory-info`, and the main thread's heap only.
   */
  jsHeapPeakBytes: z.number().nonnegative().nullable(),
  files: z.array(uploadProofFileSchema),
});

/** What `pnpm upload:proof` reads back. */
export type UploadProofReport = z.infer<typeof uploadProofReportSchema>;
