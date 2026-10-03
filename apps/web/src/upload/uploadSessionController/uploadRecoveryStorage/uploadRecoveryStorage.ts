import { idSchema, type UploadSessionDetail } from "@memory-shoebox/shared";
import { z } from "zod";
import type {
  UploadEditTargets,
  UploadRecoveryHint,
  UploadRecoveryStorage,
} from "../uploadSessionController.types";

const HINT_SCHEMA = z.strictObject({
  version: z.literal(1),
  sessionId: idSchema,
  editTargets: z.record(idSchema, z.array(idSchema)),
});

/** A distinct recovery slot per signed-in member. */
function _getStorageKeyFromMemberId(memberId: string): string {
  return `memory-shoebox:upload-recovery:${memberId}`;
}

/** Reads a validated optional hint, treating unavailable storage as empty. */
export function readUploadRecoveryHint(
  options: Readonly<{ storage: UploadRecoveryStorage; memberId: string }>,
): UploadRecoveryHint | undefined {
  try {
    const saved = options.storage.getItem(
      _getStorageKeyFromMemberId(options.memberId),
    );
    if (saved === null) {
      return undefined;
    }
    const parsed = HINT_SCHEMA.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Saves only a versioned pointer and edit ids/targets; never replays edits. */
export function writeUploadRecoveryHint(
  options: Readonly<{
    storage: UploadRecoveryStorage;
    memberId: string;
    hint: UploadRecoveryHint;
  }>,
): void {
  try {
    const hint = HINT_SCHEMA.parse(options.hint);
    options.storage.setItem(
      _getStorageKeyFromMemberId(options.memberId),
      JSON.stringify(hint),
    );
  } catch {
    // A recovery convenience must never block uploading.
  }
}

/** Forgets this member's batch without changing its server-owned session. */
export function clearUploadRecoveryHint(
  options: Readonly<{ storage: UploadRecoveryStorage; memberId: string }>,
): void {
  try {
    options.storage.removeItem(_getStorageKeyFromMemberId(options.memberId));
  } catch {
    // Blocked storage has no effect on server actions or URL-based recovery.
  }
}

/** Restores markers only when the complete live manifest supports the hint. */
export function getEditTargetsFromRecoveryHint(
  options: Readonly<{ hint?: UploadRecoveryHint; detail: UploadSessionDetail }>,
): UploadEditTargets {
  const { hint, detail } = options;
  if (
    !hint ||
    hint.sessionId !== detail.sessionId ||
    detail.nextCursor !== null
  ) {
    return new Map();
  }
  const knownFileIds = new Set(
    detail.files.map((file) => {
      return file.fileId;
    }),
  );
  return new Map(
    detail.edits.flatMap((edit) => {
      const fileIds = hint.editTargets[edit.editId];
      if (
        !fileIds ||
        edit.undoneAt !== null ||
        fileIds.length !== edit.targetCount ||
        new Set(fileIds).size !== fileIds.length ||
        !fileIds.every((fileId) => {
          return knownFileIds.has(fileId);
        })
      ) {
        return [];
      }
      return [[edit.editId, [...fileIds]] as [string, string[]]];
    }),
  );
}
