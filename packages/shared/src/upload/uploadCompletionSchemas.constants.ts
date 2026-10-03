import { z } from "zod";

import { LIMITS } from "../limits.ts";

import {
  contentHashSchema,
  byteCountSchema,
  dimensionSchema,
  uploadProblemCodeSchema,
  uploadSessionStateSchema,
} from "./uploadValueSchemas.constants.ts";

import { uploadedRenditionSchema } from "./uploadManifestSchemas.constants.ts";

import {
  uploadFileDtoSchema,
  uploadProgressSchema,
} from "./uploadDetailSchemas.constants.ts";

/**
 * `POST .../files/:fileId/complete`: the transfer is over either way.
 *
 * `outcome: "done"` needs a `contentHash` to compare with what was
 * presigned. Whether a file also needs `parts` depends on how it was
 * presigned, which only the route knows.
 */
export const completeUploadFileRequestSchema = z
  .object({
    outcome: z.enum(["done", "failed"]),
    /** `done` only. Must match the row. */
    contentHash: contentHashSchema.optional(),
    byteSize: byteCountSchema.optional(),
    /** `done` and multipart only, in part order. */
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().positive(),
          etag: z.string().min(1),
        }),
      )
      .optional(),
    /** `done` only, post-orientation. */
    width: dimensionSchema.nullish(),
    height: dimensionSchema.nullish(),
    durationMs: z.number().int().nonnegative().nullish(),
    /** `done` only: every derivative that landed. */
    renditions: z.array(uploadedRenditionSchema).optional(),
    /** `failed` only. */
    problemCode: uploadProblemCodeSchema.nullish(),
    problemDetail: z.string().max(LIMITS.freeTextMaxLength).nullish(),
  })
  .refine(
    (body) => {
      return body.outcome === "failed" || body.contentHash !== undefined;
    },
    { message: "A finished transfer names its hash.", path: ["contentHash"] },
  );

/** `POST .../files/:fileId/complete`. */
export type CompleteUploadFileRequest = z.infer<
  typeof completeUploadFileRequestSchema
>;

/** The file, and enough of the batch to move the bar without a `GET`. */
export const completeUploadFileResponseSchema = z.object({
  file: uploadFileDtoSchema,
  /** So 264 completes do not become 264 completes plus 264 GETs. */
  progress: uploadProgressSchema,
  sessionState: uploadSessionStateSchema,
  /** True only for the one caller whose latch reported `changes() = 1`. */
  didSettle: z.boolean(),
});

/** The file, and enough of the batch to move the bar without a `GET`. */
export type CompleteUploadFileResponse = z.infer<
  typeof completeUploadFileResponseSchema
>;

/** `POST .../files/:fileId/retry`. */
export const retryUploadFileResponseSchema = z.object({
  file: uploadFileDtoSchema,
  /**
   * False once the batch has settled: the latch will not fire twice, so the
   * recovered photograph appears silently and the surface must not promise
   * mail.
   */
  isIncludedInEmail: z.boolean(),
});

/** `POST .../files/:fileId/retry`. */
export type RetryUploadFileResponse = z.infer<
  typeof retryUploadFileResponseSchema
>;
