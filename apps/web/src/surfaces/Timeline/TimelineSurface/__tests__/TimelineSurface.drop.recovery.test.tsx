import {
  makeDeferredAnswer,
  makeUploadRecoveryControllerHarness,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";

import { makeUploadFileFromPosition } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";

import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";

import { act, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { describe, expect, it, vi } from "vitest";

import { renderTimeline } from "./TimelineSurface.fixtures";
import {
  dropFiles,
  installTimelineSurfaceDropTestLifecycle,
  makeDragPayloadFromFiles,
  makeEmptyHarness,
} from "./TimelineSurfacedropTestHelpers";
installTimelineSurfaceDropTestLifecycle();
describe("timeline file intake", () => {
  it("retains dropped originals if the recovery baseline read fails", async () => {
    const harness = makeUploadRecoveryControllerHarness({
      state: "draft",
      rows: [makeUploadFileFromPosition(0)],
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.api.getUploadSession
      .mockResolvedValueOnce(structuredClone(harness.serverDetail))
      .mockRejectedValueOnce(new Error("Recovery baseline unavailable"));
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("27");
    await dropFiles(makeDragPayloadFromFiles(harness.files));
    await screen.findByRole("alert");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Continue saving chosen files",
      }),
    );
    await waitFor(() => {
      expect(
        harness.controller
          .getSnapshot()
          .filesById.get(harness.serverDetail.files[0]!.fileId),
      ).toBe(harness.files[0]);
    });
    expect(harness.serverDetail.files).toHaveLength(1);
    expect(harness.engine.start).not.toHaveBeenCalled();
  });
});
describe("timeline file intake", () => {
  it("keeps dropped originals while the saved batch read fails and is retried", async () => {
    const harness = makeEmptyHarness();
    harness.api.getCurrentUploadSession.mockRejectedValueOnce(
      new Error("Catalog unavailable"),
    );
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("27");
    const file = new File(["photo"], "retained.jpg", { type: "image/jpeg" });
    await dropFiles(makeDragPayloadFromFiles([file]));
    await screen.findByRole("alert");
    await userEvent.click(
      screen.getByRole("button", { name: "Read this batch again" }),
    );
    await waitFor(() => {
      expect(
        harness.serverDetail.files.map((row) => {
          return row.originalFilename;
        }),
      ).toEqual(["retained.jpg"]);
    });
    expect([...harness.controller.getSnapshot().filesById.values()][0]).toBe(
      file,
    );
  });
});
describe("timeline file intake", () => {
  it("waits for the initial read before declaring each dropped file once", async () => {
    const harness = makeEmptyHarness();
    const read = makeDeferredAnswer<null>();
    harness.api.getCurrentUploadSession.mockReturnValueOnce(read.promise);
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const { router } = renderTimeline();
    await screen.findByText("27");
    const file = new File(["photo"], "delayed.jpg", { type: "image/jpeg" });
    await dropFiles(makeDragPayloadFromFiles([file]));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/upload");
    });
    expect(harness.serverDetail.files).toEqual([]);
    await act(async () => {
      read.answer(null);
    });
    await waitFor(() => {
      expect(harness.serverDetail.files).toHaveLength(1);
    });
    expect([...harness.controller.getSnapshot().filesById.values()][0]).toBe(
      file,
    );
  });
});
