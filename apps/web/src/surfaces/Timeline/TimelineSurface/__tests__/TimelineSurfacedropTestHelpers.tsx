import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";

import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";

import { act, fireEvent, screen } from "@testing-library/react";

import { beforeEach, vi } from "vitest";

import { respondWith } from "./timelineSurfaceTestHelpers";
/**
 * Builds matching DataTransfer file/items views from the supplied File objects
 * for drag-event delivery.
 */
export function makeDragPayloadFromFiles(files: readonly File[]): {
  dataTransfer: {
    types: string[];
    files: readonly File[];
    items: Array<{ kind: string; type: string; getAsFile: () => File }>;
  };
} {
  return {
    dataTransfer: {
      types: ["Files"],
      files,
      items: files.map((file) => {
        return {
          kind: "file",
          type: file.type,
          getAsFile: () => {
            return file;
          },
        };
      }),
    },
  };
}
/**
 * Dispatches drag-enter then drop through React act, targeting the mounted
 * upload region when present.
 */
export async function dropFiles(
  payload: Readonly<{ dataTransfer: object }>,
): Promise<void> {
  await act(async () => {
    fireEvent.dragEnter(document.body, payload);
  });
  await act(async () => {
    fireEvent.drop(
      screen.queryByRole("region", { name: "Drop files to upload" }) ??
        document.body,
      payload,
    );
  });
}
/**
 * Minimal callback-based file/directory entry contract used by recursive drop
 * intake.
 */
export type DroppedEntry = {
  name: string;
  fullPath: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (success: (file: File) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: DroppedEntry[]) => void) => void;
  };
};
/**
 * Wraps a File as a filesystem entry whose read callback settles in a
 * microtask.
 */
export function makeFileEntryFromFile(file: File): DroppedEntry {
  return {
    name: file.name,
    fullPath: `/folder/${file.name}`,
    isFile: true,
    isDirectory: false,
    file: (success) => {
      queueMicrotask(() => {
        return success(file);
      });
    },
  };
}
/**
 * Returns a directory entry whose readers deliver copied batches in order, then
 * empty batches to signal exhaustion.
 */
export function makeDirectoryEntryFromBatches({
  name,
  batches,
}: Readonly<{
  name: string;
  batches: ReadonlyArray<readonly DroppedEntry[]>;
}>): DroppedEntry {
  return {
    name,
    fullPath: `/${name}`,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let position = 0;
      return {
        readEntries: (success) => {
          const entries = batches[position++] ?? [];
          queueMicrotask(() => {
            return success([...entries]);
          });
        },
      };
    },
  };
}
/**
 * Returns an upload-controller harness with an empty session for intake and
 * recovery tests.
 */
export function makeEmptyHarness(): ReturnType<
  typeof makeUploadControllerHarness
> {
  return makeUploadControllerHarness(
    makeUploadSurfaceDetail({ files: [], fileCount: 0, totalBytes: 0 }),
  );
}
/**
 * Restores mocks and installs default timeline responses before each drop
 * scenario.
 */
export function installTimelineSurfaceDropTestLifecycle(): void {
  beforeEach(() => {
    vi.restoreAllMocks();
    respondWith();
  });
}
