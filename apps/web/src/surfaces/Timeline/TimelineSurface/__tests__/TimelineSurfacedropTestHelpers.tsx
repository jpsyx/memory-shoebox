import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";

import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";

import { act, fireEvent, screen } from "@testing-library/react";

import { beforeEach, vi } from "vitest";

import { respondWith } from "./TimelineSurface.fixtures";
/** Shared scenario fixture. */
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
/** Shared scenario fixture. */
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
/** Shared scenario fixture. */
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
/** Shared scenario fixture. */
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
/** Shared scenario fixture. */
export function makeDirectoryEntryFromBatches(
  name: string,
  batches: ReadonlyArray<readonly DroppedEntry[]>,
): DroppedEntry {
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
/** Shared scenario fixture. */
export function makeEmptyHarness(): ReturnType<
  typeof makeUploadControllerHarness
> {
  return makeUploadControllerHarness(
    makeUploadSurfaceDetail({ files: [], fileCount: 0, totalBytes: 0 }),
  );
}
/** Registers the owned scenario setup and cleanup. */
export function installTimelineSurfaceDropTestLifecycle(): void {
  beforeEach(() => {
    vi.restoreAllMocks();
    respondWith();
  });
}
