import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { vi, type Mocked } from "vitest";

/**
 * Controller boundary whose authoritative snapshots are supplied by the test.
 */
export function makeControlledUploadSessionFromSnapshot(
  initialSnapshot: Readonly<UploadSnapshot>,
): {
  controller: Mocked<UploadSessionController>;
  publishSnapshot: (snapshot: Readonly<UploadSnapshot>) => void;
} {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  return {
    controller: {
      getSnapshot: vi.fn(() => {
        return snapshot;
      }),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
      loadSession: vi.fn().mockResolvedValue(undefined),
      refreshSessionMetadata: vi.fn().mockResolvedValue(undefined),
      pickFiles: vi.fn().mockResolvedValue(undefined),
      removeFiles: vi.fn().mockResolvedValue(undefined),
      setFileBurst: vi.fn().mockResolvedValue(undefined),
      retryMissingFiles: vi.fn().mockResolvedValue(undefined),
      confirmRecoveryMatch: vi.fn().mockResolvedValue(undefined),
      skipRecoveryMatch: vi.fn().mockResolvedValue(undefined),
      applyEdits: vi.fn().mockResolvedValue(undefined),
      applyEditAttempt: vi.fn().mockResolvedValue(undefined),
      undoEdit: vi.fn().mockResolvedValue(undefined),
      amendDates: vi.fn().mockResolvedValue(undefined),
      toggleFile: vi.fn(),
      selectDay: vi.fn(),
      selectAll: vi.fn(),
      clearSelection: vi.fn(),
      startUpload: vi.fn().mockResolvedValue(undefined),
      closeBatch: vi.fn().mockResolvedValue(undefined),
      cancelDraft: vi.fn().mockResolvedValue(undefined),
      discardDraft: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      destroy: vi.fn(),
    },
    publishSnapshot: (updatedSnapshot) => {
      snapshot = updatedSnapshot;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}
