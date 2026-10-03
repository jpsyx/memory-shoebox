import { z } from "zod";

import { idSchema, signedUrlSchema, timestampSchema } from "../dtos.ts";

import {
  contentHashSchema,
  byteCountSchema,
  renditionPurposeSchema,
} from "./uploadValueSchemas.constants.ts";

/** The headers a presigned PUT must carry, `Content-Type` included. */
const presignHeadersSchema = z.record(z.string(), z.string());

/** One URL, one PUT. */
export const presignSingleSchema = z.object({
  mode: z.literal("single"),
  fileId: idSchema,
  method: z.literal("PUT"),
  url: signedUrlSchema,
  /** Exactly what the browser must send, `Content-Type` included. */
  headers: presignHeadersSchema,
  expiresAt: timestampSchema,
});

/** One URL, one PUT. */
export type PresignSingle = z.infer<typeof presignSingleSchema>;

/** A multipart upload, and the part URLs asked for. */
export const presignMultipartSchema = z.object({
  mode: z.literal("multipart"),
  fileId: idSchema,
  multipartUploadId: z.string().min(1),
  partSizeBytes: z.number().int().positive(),
  partCount: z.number().int().positive(),
  parts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      url: signedUrlSchema,
      expiresAt: timestampSchema,
    }),
  ),
  method: z.literal("PUT"),
  headers: presignHeadersSchema,
  /** The earliest of the parts, so the client has one number to watch. */
  expiresAt: timestampSchema,
});

/** A multipart upload, and the part URLs asked for. */
export type PresignMultipart = z.infer<typeof presignMultipartSchema>;

/** `POST .../files/:fileId/presign`. */
export const presignUploadFileRequestSchema = z.object({
  /** Required here even when the manifest omitted it. */
  contentHash: contentHashSchema,
  /** Must equal the row's `declared_bytes`. */
  byteSize: byteCountSchema,
  purpose: renditionPurposeSchema.default("original"),
  /** Multipart only: the parts still wanted. Omitted means all of them. */
  partNumbers: z.array(z.number().int().positive()).min(1).optional(),
});

/** `POST .../files/:fileId/presign`. */
export type PresignUploadFileRequest = z.infer<
  typeof presignUploadFileRequestSchema
>;

/** Single or multipart, told apart by `mode`. */
export const presignUploadFileResponseSchema = z.discriminatedUnion("mode", [
  presignSingleSchema,
  presignMultipartSchema,
]);

/** Single or multipart, told apart by `mode`. */
export type PresignUploadFileResponse = z.infer<
  typeof presignUploadFileResponseSchema
>;
