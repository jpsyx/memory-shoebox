import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { UploadDayGroup } from "./UploadDayGroup";

const resources: Array<() => void> = [];
afterEach(() => {
  resources.splice(0).forEach((release) => {
    release();
  });
});

async function _renderBurst(
  viewerKind: "owner" | "admin" | "other" = "owner",
  state: "draft" | "settled" = "draft",
): Promise<ReturnType<typeof makeUploadControllerHarness>> {
  const file = {
    ...makeUploadFileFromPosition(0),
    state: state === "draft" ? ("waiting" as const) : ("done" as const),
    burst: { groupId: "burst-one", photoCount: 3, isExcluded: false },
  };
  const detail = makeUploadSurfaceDetail({ state, files: [file] });
  const harness = makeUploadControllerHarness(detail);
  await harness.controller.loadSession(detail.sessionId);
  const previews = createUploadPreviewQueue();
  const viewer = {
    memberId:
      viewerKind === "owner" ? detail.uploadedBy.memberId : "another-member",
    isAdmin: viewerKind === "admin",
  };
  const Wrapper = (): ReactNode => {
    const snapshot = useSyncExternalStore(
      harness.controller.subscribe,
      harness.controller.getSnapshot,
    );
    return (
      <MantineProvider>
        <UploadDayGroup
          day={{ capturedOn: file.capturedOn!, fileCount: 1, milestones: [] }}
          snapshot={snapshot}
          controller={harness.controller}
          previews={previews}
          viewer={viewer}
        />
      </MantineProvider>
    );
  };
  const view = render(<Wrapper />);
  resources.push(() => {
    view.unmount();
    previews.destroy();
    harness.controller.destroy();
  });
  return harness;
}

describe("upload burst controls", () => {
  it.each(["draft", "settled"] as const)(
    "keeps the %s photo visible when removed and offers return to its burst",
    async (state) => {
      const harness = await _renderBurst("owner", state);
      expect(screen.getByText("Burst · 3 photos")).toBeVisible();
      fireEvent.click(
        screen.getByRole("button", { name: "Make standalone: IMG_0.jpg" }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Return to burst: IMG_0.jpg" }),
        ).toBeEnabled();
      });
      expect(screen.getByText("Standalone photo")).toBeVisible();
      expect(harness.controller.getSnapshot().detail!.files).toHaveLength(1);
      fireEvent.click(
        screen.getByRole("button", { name: "Return to burst: IMG_0.jpg" }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Make standalone: IMG_0.jpg" }),
        ).toBeEnabled();
      });
    },
  );

  it("lets an admin edit another uploader's burst", async () => {
    await _renderBurst("admin");
    expect(
      screen.getByRole("button", { name: "Make standalone: IMG_0.jpg" }),
    ).toBeEnabled();
  });

  it("keeps a separated photo visible without offering an unavailable return", async () => {
    const harness = await _renderBurst("owner", "settled");
    harness.serverDetail.files[0]!.burst = {
      groupId: "burst-one",
      photoCount: 2,
      isExcluded: true,
      canRestore: false,
    };
    await act(async () => {
      await harness.controller.loadSession(harness.serverDetail.sessionId);
    });
    expect(screen.getByText("Standalone photo")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Return to burst: IMG_0.jpg" }),
    ).not.toBeInTheDocument();
    expect(harness.controller.getSnapshot().detail!.files).toHaveLength(1);
  });

  it("shows burst context without controls to another member", async () => {
    await _renderBurst("other");
    expect(screen.getByText("Burst · 3 photos")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /from burst|to burst/ }),
    ).not.toBeInTheDocument();
  });

  it("disables a pending change and lets a failed change be retried", async () => {
    const harness = await _renderBurst();
    const pending = makeDeferredAnswer<UploadSessionDetail>();
    harness.api.setUploadFileBurst.mockReturnValueOnce(pending.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Make standalone: IMG_0.jpg" }),
    );
    expect(
      screen.getByRole("button", { name: "Make standalone: IMG_0.jpg" }),
    ).toBeDisabled();
    await act(async () => {
      pending.reject(new Error("offline"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    fireEvent.click(
      screen.getByRole("button", { name: "Make standalone: IMG_0.jpg" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Return to burst: IMG_0.jpg" }),
      ).toBeEnabled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
