import type { LightMyRequestResponse } from "fastify";
import type { setUpUploadTestContext } from "../../uploadManifest/__tests__/uploadManifestTestHelpers.ts";

/** The real route, with this draft fixture's credentials. */
export function removeUploadFilesFromTestContext(
  options: Readonly<{
    context: Awaited<ReturnType<typeof setUpUploadTestContext>>;
    fileIds: readonly string[];
  }>,
): Promise<LightMyRequestResponse> {
  return options.context.app.inject({
    method: "DELETE",
    url: `/api/upload-sessions/${options.context.sessionId}/files`,
    headers: { cookie: options.context.cookie },
    payload: { fileIds: options.fileIds },
  });
}
