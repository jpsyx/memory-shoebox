import type { FastifyRequest } from "fastify";
import {
  putUploadManifestRequestSchema,
  uploadSessionParamsSchema,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { reconcileManifest } from "../../upload/reconcileManifest.ts";
import {
  assertMayUpload,
  getOwnUploadSessionOr404,
} from "../../upload/uploadSessionAccess.ts";

/**
 * `PATCH /upload-sessions/:sessionId/manifest`: declare, re-declare, amend.
 *
 * `PATCH` rather than `PUT` (Ruling 8): a strict `PUT` makes a partial body
 * destructive, and the rows it would drop may have bytes in the bucket.
 *
 * The session is read inside the transaction, so the commit check and the
 * write cannot straddle a concurrent `POST /commit`. 404 before 403: the
 * session resolves for its own uploader only, an admin included, and only
 * then is the role checked. `shoebox.timezone` is read before the
 * transaction opens, because it is one row and every entry needs it.
 */
export async function patchUploadManifest(
  request: FastifyRequest,
): Promise<PutUploadManifestResponse> {
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
      const session = await getOwnUploadSessionOr404({
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
