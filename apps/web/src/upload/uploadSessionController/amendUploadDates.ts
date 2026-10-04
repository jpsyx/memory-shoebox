import {
  calendarDateSchema,
  UPLOAD_LIMITS,
  type ManifestEntry,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { loadUploadSession } from "./uploadManifestReadHelpers";
import type {
  UploadControllerContext,
  UploadDateChoice,
} from "./uploadSessionController.types";

function _getManifestEntriesFromDateChoices(
  options: Readonly<{
    detail: UploadSessionDetail;
    choices: readonly UploadDateChoice[];
  }>,
): ManifestEntry[] {
  return options.choices.map((choice) => {
    const capturedOn = calendarDateSchema.parse(choice.capturedOn);
    const row = options.detail.files.find((file) => {
      return file.fileId === choice.fileId;
    });
    if (!row || row.state !== "waiting") {
      throw new Error(
        "Only a known waiting draft file can have its date corrected.",
      );
    }
    return {
      clientRef: row.fileId,
      fileId: row.fileId,
      originalFilename: row.originalFilename,
      declaredContentType: row.declaredContentType,
      declaredBytes: row.declaredBytes,
      contentHash: row.contentHash,
      capturedAt: `${capturedOn}T00:00:00.000Z`,
    };
  });
}

type SendDateChunksOptions = {
  context: UploadControllerContext;
  generation: number;
  sessionId: string;
  entries: readonly ManifestEntry[];
};

async function _sendDateChunks(
  options: Readonly<SendDateChunksOptions>,
): Promise<void> {
  const { context, generation, sessionId, entries } = options;
  if (!context.isCurrent(generation) || entries.length === 0) {
    return;
  }
  await context.dependencies.api.putUploadManifest({
    sessionId,
    files: entries.slice(0, UPLOAD_LIMITS.manifestEntriesPerRequest),
  });
  if (context.isCurrent(generation)) {
    await loadUploadSession({ context, generation, sessionId });
    await _sendDateChunks({
      ...options,
      entries: entries.slice(UPLOAD_LIMITS.manifestEntriesPerRequest),
    });
  }
}

/** Sends calendar dates from known DTO rows; clock preservation is server-owned. */
export async function amendUploadDates(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    choices: readonly UploadDateChoice[];
  }>,
): Promise<void> {
  const { context, generation, choices } = options;
  const detail = context.state.snapshot.detail;
  if (!detail || detail.state !== "draft") {
    throw new Error("Only a draft batch can be edited.");
  }
  const entries = _getManifestEntriesFromDateChoices({ detail, choices });
  await _sendDateChunks({
    context,
    generation,
    sessionId: detail.sessionId,
    entries,
  });
}
