import type { FastifyRequest } from "fastify";
import {
  putUploadManifestRequestSchema,
  uploadSessionParamsSchema,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { reconcileManifest } from "../../upload/reconcileManifest/reconcileManifest.ts";
import {
  assertMayUpload,
  getOwnUploadSessionFromSessionIdOr404,
} from "../../upload/uploadSessionAccessHelpers.ts";

/**
 * PATCH /upload-sessions/:sessionId/manifest declares, re-declares or amends
 * files.
 *
 * PATCH is additive: a partial body must not remove rows whose bytes may
 * already be in the bucket. The session read and write share a transaction so a
 * concurrent commit cannot split the eligibility check from the write.
 *
 * Resolve the session for its own uploader before checking the role, including
 * for admins: a missing or foreign session is 404 before a role error is 403.
 */
export async function patchUploadManifest(
  request: FastifyRequest,
): Promise<PutUploadManifestResponse> {
  // Read shoebox.timezone before opening the write transaction; every manifest
  // entry uses the same setting.

  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const body = putUploadManifestRequestSchema.parse(request.body);
  const { database } = request.server;
  const now = request.server.clock().toISOString();
  const settings = await readInstanceSettings({
    database,
    keys: ["shoebox.timezone"],
  });

  return runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await getOwnUploadSessionFromSessionIdOr404({
        database: transaction,
        viewer,
        sessionId,
      });
      assertMayUpload(viewer);
      return reconcileManifest({
        transaction,
        session,
        entries: body.files,
        timezone: settings["shoebox.timezone"],
        now,
      });
    },
  });
}
