import type { SetUploadVisibilityRequest } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { makeUploadControllerHarness } from "./uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadFileFromPosition } from "./uploadSurfaceFixtureHelpers";

const EVERYONE: SetUploadVisibilityRequest = { mode: "everyone", subjects: [] };
const SUBJECT_ID = "018f0000-0000-7000-8000-000000000002";

describe("upload visibility and arm ordering", () => {
  it("everyone skips its write and uploads unticked accepted files", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 2));
    const uploading = harness.controller.startUpload(EVERYONE);
    await expect
      .poll(() => {
        return harness.engine.start.mock.calls.length;
      })
      .toBe(1);
    expect(harness.engine.start).toHaveBeenCalledWith([
      {
        fileId: harness.serverDetail.files[0]!.fileId,
        file: harness.pickedFiles[0],
      },
      {
        fileId: harness.serverDetail.files[1]!.fileId,
        file: harness.pickedFiles[1],
      },
    ]);
    expect(harness.api.setUploadVisibility).not.toHaveBeenCalled();
    harness.answerRun();
    await uploading;
  });

  it("restriction saves before arm and engine", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const callOrder: string[] = [];
    harness.api.setUploadVisibility.mockImplementation(async () => {
      callOrder.push("visibility");
      return {
        visibilityRuleId: "only-rule",
        mode: "only",
        label: null,
        subjects: [{ kind: "member", id: SUBJECT_ID, displayName: "Ana" }],
      };
    });
    harness.api.commitUploadSession.mockImplementation(async () => {
      callOrder.push("arm");
      return { ...harness.serverDetail, state: "uploading" };
    });
    harness.engine.start.mockImplementation(() => {
      callOrder.push("engine");
      return Promise.resolve();
    });
    await harness.controller.startUpload({
      mode: "only",
      subjects: [{ kind: "member", id: SUBJECT_ID }],
    });
    expect(callOrder).toEqual(["visibility", "arm", "engine"]);
    expect(harness.api.setUploadVisibility).toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      body: { mode: "only", subjects: [{ kind: "member", id: SUBJECT_ID }] },
    });
  });

  it.each(["only", "except"] as const)("empty %s blocks arm", async (mode) => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
    await expect(
      harness.controller.startUpload({ mode, subjects: [] }),
    ).rejects.toThrow();
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().phase).toBe("draft");
    expect(harness.controller.getSnapshot().error?.operation).toBe("upload");
  });

  it("all refused files cannot arm", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
    harness.serverDetail.files[0]!.state = "refused";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await expect(harness.controller.startUpload(EVERYONE)).rejects.toThrow();
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    expect(harness.engine.start).not.toHaveBeenCalled();
  });

  it("equivalent restricted subjects skip a write regardless of order", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const secondId = "018f0000-0000-7000-8000-000000000003";
    harness.serverDetail.visibility = {
      visibilityRuleId: "only-rule",
      mode: "only",
      label: null,
      subjects: [
        { kind: "member", id: SUBJECT_ID, displayName: "Ana" },
        { kind: "group", id: secondId, displayName: "Family" },
      ],
    };
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.engine.start.mockResolvedValueOnce(undefined);
    await harness.controller.startUpload({
      mode: "only",
      subjects: [
        { kind: "group", id: secondId },
        { kind: "member", id: SUBJECT_ID },
      ],
    });
    expect(harness.api.setUploadVisibility).not.toHaveBeenCalled();
    expect(harness.api.commitUploadSession).toHaveBeenCalledOnce();
  });

  it("visibility failure leaves the draft editable without arming", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
    harness.api.setUploadVisibility.mockRejectedValueOnce(new Error("Offline"));
    await expect(
      harness.controller.startUpload({
        mode: "only",
        subjects: [{ kind: "member", id: SUBJECT_ID }],
      }),
    ).rejects.toThrow("Offline");
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    harness.controller.selectAll();
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(1);
  });

  it("missing originals block arm rather than sending only retained handles", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 2));
    harness.engine.start.mockResolvedValueOnce(undefined);
    harness.serverDetail.files.push(makeUploadFileFromPosition(2));
    harness.serverDetail.fileCount = 3;
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await expect(
      harness.controller.startUpload({
        mode: "only",
        subjects: [{ kind: "member", id: SUBJECT_ID }],
      }),
    ).rejects.toThrow("Pick the original files again");
    expect(harness.api.setUploadVisibility).not.toHaveBeenCalled();
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    expect(harness.engine.start).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().phase).toBe("draft");
    expect(harness.controller.getSnapshot().error?.operation).toBe("upload");
    expect(harness.controller.getSnapshot().detail?.files).toHaveLength(3);
  });

  it("two start clicks arm once", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const uploading = harness.controller.startUpload(EVERYONE);
    await expect(harness.controller.startUpload(EVERYONE)).rejects.toThrow();
    await expect
      .poll(() => {
        return harness.engine.start.mock.calls.length;
      })
      .toBe(1);
    await expect(harness.controller.startUpload(EVERYONE)).rejects.toThrow();
    expect(harness.api.commitUploadSession).toHaveBeenCalledTimes(1);
    harness.answerRun();
    await uploading;
  });
});
