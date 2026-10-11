import type { FastifyRequest } from "fastify";
import {
  setUploadFileBurstRequestSchema,
  uploadFileParamsSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { setUploadFileBurst } from "../../upload/setUploadFileBurst.ts";
import { readUploadSessionDetail } from "../../upload/readUploadSessionDetailHelpers.ts";

/** Changes a candidate's grouping, before transfer or after settlement. */
export async function patchUploadFileBurst(
  request: FastifyRequest,
): Promise<UploadSessionDetail> {
  const viewer = requireViewer(request);
  const { sessionId, fileId } = uploadFileParamsSchema.parse(request.params);
  const { excluded } = setUploadFileBurstRequestSchema.parse(request.body);
  await runInImmediateTransaction({
    database: request.server.database,
    callback: (database) => {
      return setUploadFileBurst({
        database,
        viewer,
        sessionId,
        fileId,
        excluded,
      });
    },
  });
  return readUploadSessionDetail({
    database: request.server.database,
    b2: request.server.b2,
    sessionId,
    now: request.server.clock(),
  });
}
