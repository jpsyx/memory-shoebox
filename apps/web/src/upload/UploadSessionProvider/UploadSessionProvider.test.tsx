import { StrictMode, type ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as controllerModule from "@/upload/uploadSessionController/uploadSessionController";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import { createMeResponse } from "@/testing/createMeResponse";
import { makeViewerFromMeResponse } from "@/session/requireSignedIn/requireSignedIn";
import { UploadSessionProvider } from "./UploadSessionProvider";
import { useUploadSessionController } from "./useUploadSessionController";
import { useUploadSnapshot } from "./useUploadSnapshot";
const viewer = makeViewerFromMeResponse(createMeResponse());
function Consumer(): ReactNode {
  const controller = useUploadSessionController();
  const snapshot = useUploadSnapshot(controller);
  return (
    <>
      <span>{snapshot.phase}</span>
      <button
        onClick={() => {
          void controller.pickFiles([
            new File(["bytes"], "a.jpg", { type: "image/jpeg" }),
          ]);
        }}
      >
        Pick
      </button>
      <button
        onClick={() => {
          void controller.startUpload({ mode: "everyone", subjects: [] });
        }}
      >
        Send
      </button>
    </>
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
});
describe("upload shell lifetime", () => {
  it("StrictMode never arms or starts twice and navigation leaves the engine running", async () => {
    const harness = makeUploadControllerHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const view = render(
      <StrictMode>
        <UploadSessionProvider viewer={viewer}>
          <Consumer />
        </UploadSessionProvider>
      </StrictMode>,
    );
    fireEvent.click(screen.getByText("Pick"));
    await screen.findByText("draft");
    fireEvent.click(screen.getByText("Send"));
    await screen.findByText("sending");
    expect(harness.engine.start).toHaveBeenCalledTimes(1);
    expect(harness.api.commitUploadSession).toHaveBeenCalledTimes(1);
    view.rerender(
      <StrictMode>
        <UploadSessionProvider viewer={viewer}>
          <span>The pile</span>
        </UploadSessionProvider>
      </StrictMode>,
    );
    expect(harness.engine.cancel).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => {
      expect(harness.engine.cancel).toHaveBeenCalledOnce();
    });
  });
  it("member replacement destroys the old controller and does not reuse same-session state", async () => {
    const first = makeUploadControllerHarness();
    const second = makeUploadControllerHarness();
    const factory = vi
      .spyOn(controllerModule, "createUploadSessionController")
      .mockReturnValue(first.controller);
    const destroy = vi.spyOn(first.controller, "destroy");
    const view = render(
      <UploadSessionProvider viewer={viewer}>
        <Consumer />
      </UploadSessionProvider>,
    );
    await act(async () => {
      await first.controller.pickFiles([new File(["old"], "old.jpg")]);
    });
    factory.mockReturnValue(second.controller);
    view.rerender(
      <UploadSessionProvider
        viewer={{ ...viewer, memberId: "018f0000-0000-7000-8000-000000000002" }}
      >
        <Consumer />
      </UploadSessionProvider>,
    );
    expect(screen.getByText("idle")).toBeVisible();
    await waitFor(() => {
      expect(destroy).toHaveBeenCalledOnce();
    });
    expect(second.controller.getSnapshot().filesById.size).toBe(0);
  });
});
