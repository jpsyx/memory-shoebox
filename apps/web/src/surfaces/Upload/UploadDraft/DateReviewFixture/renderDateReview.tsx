import { act, render, type RenderResult } from "@testing-library/react";
import { vi, type Mocked } from "vitest";
import type {
  UploadDateChoice,
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type {
  UploadPreview,
  UploadPreviewQueue,
} from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import { makeControlledUploadSessionFromSnapshot } from "@/testing/makeControlledUploadSessionFromSnapshot";
import { makeUploadSnapshotFromDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { DateReviewFixture } from "./DateReviewFixture";
import { makeDateReviewDetail } from "./makeDateReviewDetail";

type DateReviewHarness = {
  controller: Mocked<UploadSessionController>;
  snapshot: UploadSnapshot;
  publishBusy: (isBusy: boolean) => void;
  publishConfirmed: (choices: readonly UploadDateChoice[]) => void;
  publishPreview: (fileId: string) => void;
  dispose: RenderResult["unmount"];
};

/**
 * Renders the real date form with independently controlled server and preview
 * state.
 */
export function renderDateReview(): DateReviewHarness {
  const snapshot: UploadSnapshot = {
    ...makeUploadSnapshotFromDetail(makeDateReviewDetail()),
    phase: "draft",
    isRunning: false,
  };
  const session = makeControlledUploadSessionFromSnapshot(snapshot);
  const values = new Map<string, UploadPreview>();
  const listeners = new Set<() => void>();
  const previews: UploadPreviewQueue = {
    getPreview: (fileId) => {
      return values.get(fileId);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    requestPreview: () => {},
    deactivate: () => {},
    release: () => {},
    setPaused: () => {},
    destroy: () => {},
  };
  const onStart = vi.fn();
  const view = render(
    <DateReviewFixture
      snapshot={snapshot}
      controller={session.controller}
      previews={previews}
      onStart={onStart}
    />,
  );
  const publish = (updatedSnapshot: UploadSnapshot): void => {
    act(() => {
      session.publishSnapshot(updatedSnapshot);
    });
    view.rerender(
      <DateReviewFixture
        snapshot={updatedSnapshot}
        controller={session.controller}
        previews={previews}
        onStart={onStart}
      />,
    );
  };
  return {
    controller: session.controller,
    snapshot,
    dispose: view.unmount,
    publishBusy: (isBusy) => {
      publish({ ...session.controller.getSnapshot(), isBusy });
    },
    publishConfirmed: (choices) => {
      const current = session.controller.getSnapshot();
      const detail = current.detail!;
      const files = detail.files.map((file) => {
        const choice = choices.find((candidate) => {
          return candidate.fileId === file.fileId;
        });
        return choice
          ? {
              ...file,
              capturedOn: choice.capturedOn,
              captureSource: "uploader_set" as const,
            }
          : file;
      });
      const undatedFiles = detail.undated!.files.filter((file) => {
        return !choices.some((choice) => {
          return choice.fileId === file.fileId;
        });
      });
      publish({
        ...current,
        isBusy: false,
        detail: {
          ...detail,
          files,
          undated: {
            ...detail.undated!,
            files: undatedFiles,
            fileCount: undatedFiles.length,
          },
        },
      });
    },
    publishPreview: (fileId) => {
      act(() => {
        values.set(`date-review:${fileId}`, {
          kind: "ready",
          url: "blob:preview-1",
          width: 400,
          height: 300,
        });
        listeners.forEach((listener) => {
          listener();
        });
      });
    },
  };
}
