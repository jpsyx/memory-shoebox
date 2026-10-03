import type {
  CompleteUploadFileResponse,
  ManifestEntry,
  ManifestOutcome,
} from "@memory-shoebox/shared";
import { vi } from "vitest";
import { makeJpegBytesFromExif } from "@/testing/mediaBytesHelpers/mediaBytesHelpers";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type {
  UploadEngineEvent,
  UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine.types";

import {
  type UploadProofApi,
  type UploadProofDependencies,
} from "@/upload/proof/runUploadProof/runUploadProof.types";

/**
 * Stable upload-session id used by the fixtures.
 */
export const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";

/** A file id for the nth declared file. */
export function makeFileIdFromIndex(index: number): string {
  return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

/** Three picks: two photographs and a PDF the server will refuse. */
export function createFilePicks(): File[] {
  const jpeg = makeJpegBytesFromExif(undefined);
  return [
    new File([jpeg], "a.jpg", { type: "image/jpeg" }),
    new File([jpeg], "b.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array([0x25, 0x50])], "menu.pdf", {
      type: "application/pdf",
    }),
  ];
}

/** `count` photographs, each named for its place in the selection. */
export function createJpegPicks(count: number): File[] {
  const jpeg = makeJpegBytesFromExif(undefined);
  return Array.from({ length: count }, (_, index) => {
    return new File([jpeg], `p${index}.jpg`, { type: "image/jpeg" });
  });
}

/** The outcome the fake manifest gives an entry. */
export function makeManifestOutcomeFromEntry(
  entry: Readonly<ManifestEntry>,
): ManifestOutcome {
  const isRefused = entry.declaredContentType === "application/pdf";
  return {
    clientRef: entry.clientRef,
    fileId: makeFileIdFromIndex(Number(entry.clientRef) + 1),
    disposition: isRefused ? "refused" : "created",
    state: isRefused ? "refused" : "waiting",
    capturedOn: null,
    captureSource: null,
    problemCode: isRefused ? "unsupported_type" : null,
  };
}

/** An API with a session of the given state, or none at all. */
export function createFakeUploadApi(
  current: "none" | "draft" | "uploading",
): UploadProofApi & Record<keyof UploadProofApi, ReturnType<typeof vi.fn>> {
  return {
    getCurrentUploadSession: vi.fn(async () => {
      return current === "none"
        ? null
        : makeUploadSessionDetail({ sessionId: SESSION_ID, state: current });
    }),
    openUploadSession: vi.fn(async () => {
      return makeUploadSessionDetail({ sessionId: SESSION_ID });
    }),
    putUploadManifest: vi.fn(async (options) => {
      return {
        sessionId: SESSION_ID,
        fileCount: 3,
        totalBytes: 0,
        outcomes: options.files.map(makeManifestOutcomeFromEntry),
      };
    }),
    commitUploadSession: vi.fn(async () => {
      return makeUploadSessionDetail({
        sessionId: SESSION_ID,
        state: "uploading",
      });
    }),
  };
}

/**
 * Makes the manifest answer some picks with another pick's file id, as a
 * resume does for byte-identical files (`twinOf` maps a `clientRef` to the
 * `clientRef` whose row it matched).
 */
export function setManifestTwinAnswers(
  functionOptions: Readonly<{
    api: ReturnType<typeof createFakeUploadApi>;
    twinOf: Readonly<Record<string, string>>;
  }>,
): void {
  const { api, twinOf } = functionOptions;

  api.putUploadManifest.mockImplementation(
    async (options: Parameters<UploadProofApi["putUploadManifest"]>[0]) => {
      return {
        sessionId: SESSION_ID,
        fileCount: options.files.length,
        totalBytes: 0,
        outcomes: options.files.map((entry) => {
          const outcome = makeManifestOutcomeFromEntry(entry);
          const sharedRef = twinOf[entry.clientRef];
          return sharedRef === undefined
            ? outcome
            : {
                ...outcome,
                fileId: makeFileIdFromIndex(Number(sharedRef) + 1),
              };
        }),
      };
    },
  );
}

/** What `complete` answers for one landed file. */
export function makeDoneResponseFromFileId(
  item: UploadEngineFile,
): CompleteUploadFileResponse {
  return {
    file: {
      fileId: item.fileId,
      position: 0,
      originalFilename: item.file.name,
      declaredContentType: item.file.type,
      declaredBytes: item.file.size,
      contentHash: null,
      state: "done",
      attemptCount: 1,
      problemCode: null,
      problemDetail: null,
      capturedAt: null,
      capturedOn: null,
      captureOffsetMinutes: null,
      captureSource: null,
      itemId: null,
      media: null,
    },
    progress: makeUploadSessionDetail().progress,
    sessionState: "settled",
    didSettle: false,
  };
}

/** An engine that lands every file it is given, one after the other. */
export function makeFakeEngineFromOptions(
  sent: UploadEngineFile[][],
): UploadProofDependencies["createEngine"] {
  return (options) => {
    return {
      start: async (files) => {
        sent.push([...files]);
        files.forEach((item) => {
          const response = makeDoneResponseFromFileId(item);
          const events: UploadEngineEvent[] = [
            { kind: "file-started", fileId: item.fileId },
            {
              kind: "file-progress",
              fileId: item.fileId,
              sentBytes: 1,
              totalBytes: 1,
            },
            { kind: "file-done", fileId: item.fileId, response },
          ];
          events.forEach(options.onEvent);
        });
        options.onEvent({ kind: "settled", sessionState: "settled" });
      },
      cancel: () => {},
    };
  };
}
