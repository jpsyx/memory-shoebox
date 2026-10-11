import { getWholeUploadSessionFromSessionId } from "@/api/uploadsHelpers/getWholeUploadSessionFromSessionId/getWholeUploadSessionFromSessionId";
import type { UploadControllerContext } from "./createUploadSessionController.types";
import { publishUploadSessionDetail } from "./uploadManifestReadHelpers";

type BurstOptions = {
  context: UploadControllerContext;
  generation: number;
  fileId: string;
  excluded: boolean;
};

/** Refreshes the complete burst context while retaining originals and ticks. */
export async function setUploadBurstMembership({
  context,
  generation,
  fileId,
  excluded,
}: Readonly<BurstOptions>): Promise<void> {
  const session = context.state.snapshot.detail;
  const file = session?.files.find((candidate) => {
    return candidate.fileId === fileId;
  });
  if (!session || !file?.burst || session.state === "cancelled") {
    throw new Error("Choose a photo with a burst in this batch.");
  }
  const response = await context.dependencies.api.setUploadFileBurst({
    sessionId: session.sessionId,
    fileId,
    excluded,
  });
  context.dependencies.onBurstChanged();
  if (!context.isCurrent(generation)) {
    return;
  }
  const detail = response.nextCursor
    ? await getWholeUploadSessionFromSessionId({
        sessionId: session.sessionId,
        read: context.dependencies.api.getUploadSession,
      })
    : response;
  if (context.isCurrent(generation)) {
    publishUploadSessionDetail({ context, detail });
  }
}
