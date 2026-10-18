import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/makePreviewHarnessFromOptions";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSnapshotFromDetail,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadDraft } from "./UploadDraft/UploadDraft";
import { UploadTransfer } from "./UploadTransfer/UploadTransfer";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...original,
    Link: ({ children }: Readonly<{ children: ReactNode }>) => {
      return <a href="/">{children}</a>;
    },
  };
});

beforeEach(() => {
  class VisibleObserver extends IntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      super(callback);
      this.observe = (target) => {
        const rectangle = target.getBoundingClientRect();
        callback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: rectangle,
              intersectionRect: rectangle,
              rootBounds: null,
              time: 0,
            },
          ],
          this,
        );
      };
    }
  }
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function _makeSurfaceFromSnapshot(
  options: Readonly<{
    snapshot: UploadSnapshot;
    previews: ReturnType<typeof makePreviewHarnessFromOptions>;
  }>,
): ReactNode {
  const { snapshot, previews } = options;
  const { controller } = makeUploadControllerHarness(snapshot.detail!);
  const shared = {
    snapshot,
    controller,
    previews: previews.queue,
    viewer: snapshot.detail!.uploadedBy,
  };
  return snapshot.phase === "draft" ? (
    <UploadDraft
      {...shared}
      visibility={{ mode: "everyone", subjects: [] }}
      onVisibilityChange={vi.fn()}
      onStart={vi.fn()}
      onOpenMilestone={vi.fn()}
    />
  ) : (
    <UploadTransfer {...shared} onPick={vi.fn()} onUploadMore={vi.fn()} />
  );
}

function _renderDuplicate(
  options: Readonly<{
    phase: "draft" | "done" | "partial";
    duplicateReason: "archive" | "batch";
    hasOriginal: boolean;
  }>,
) {
  const file = {
    ...makeUploadFileFromPosition(0),
    state: "cancelled" as const,
    duplicateReason: options.duplicateReason,
  };
  const detail = makeUploadSurfaceDetail({
    state: options.phase === "draft" ? "draft" : "settled",
    files: [file],
    fileCount: 1,
    days: [],
  });
  const snapshot = makeUploadSnapshotFromDetail(detail);
  snapshot.phase = options.phase;
  snapshot.isRunning = false;
  if (options.hasOriginal) {
    snapshot.filesById.set(
      file.fileId,
      new File(["photo"], file.originalFilename),
    );
  }
  const previews = makePreviewHarnessFromOptions();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        {_makeSurfaceFromSnapshot({ snapshot, previews })}
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { file, previews, view };
}

describe.each(["draft", "done", "partial"] as const)(
  "duplicate previews in %s",
  (phase) => {
    it.each(["archive", "batch"] as const)(
      "shows the selected original for a skipped %s duplicate",
      async (duplicateReason) => {
        const { file, previews, view } = _renderDuplicate({
          phase,
          duplicateReason,
          hasOriginal: true,
        });
        try {
          expect(previews.requests).toHaveLength(1);
          await act(async () => {
            previews.answer({ index: 0 });
          });
          expect(
            screen.getByRole("img", { name: file.originalFilename }),
          ).toHaveAttribute("src", "blob:preview-1");
          expect(
            screen.queryByText("Original unavailable here"),
          ).not.toBeInTheDocument();
        } finally {
          view.unmount();
          previews.queue.destroy();
        }
      },
    );

    it("keeps an honest fallback when a reload has lost the original", () => {
      const { previews, view } = _renderDuplicate({
        phase,
        duplicateReason: "archive",
        hasOriginal: false,
      });
      try {
        expect(screen.getByText("Original unavailable here")).toBeVisible();
        expect(previews.requests).toHaveLength(0);
      } finally {
        view.unmount();
        previews.queue.destroy();
      }
    });
  },
);
