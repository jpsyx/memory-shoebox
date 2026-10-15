import { createMeResponse } from "@/testing/createMeResponse";

import { renderTimelineInStrictMode } from "@/routes/rendering/__tests__/renderingFixtureHelpers";

import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";

import { screen, waitFor } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";

import { renderTimeline, respondWith } from "./TimelineSurface.fixtures";
import {
  dropFiles,
  installTimelineSurfaceDropTestLifecycle,
  makeDirectoryEntryFromBatches,
  makeDragPayloadFromFiles,
  makeEmptyHarness,
  makeFileEntryFromFile,
} from "./TimelineSurfacedropTestHelpers";
installTimelineSurfaceDropTestLifecycle();
describe("timeline file intake", () => {
  it("opens a fresh draft for files dropped after a completed upload", async () => {
    const harness = makeEmptyHarness();
    await harness.controller.pickFiles([
      new File(["photo"], "completed.jpg", { type: "image/jpeg" }),
    ]);
    harness.serverDetail.state = "settled";
    harness.serverDetail.files[0]!.state = "done";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.api.openUploadSession.mockImplementationOnce(async () => {
      harness.serverDetail.state = "draft";
      harness.serverDetail.files = [];
      harness.serverDetail.fileCount = 0;
      return structuredClone(harness.serverDetail);
    });
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("27");
    const file = new File(["new photo"], "fresh.jpg", { type: "image/jpeg" });
    await dropFiles(makeDragPayloadFromFiles([file]));
    await waitFor(() => {
      expect(harness.controller.getSnapshot().phase).toBe("draft");
    });
    expect(harness.serverDetail.files).toHaveLength(1);
    expect(harness.serverDetail.files[0]!.originalFilename).toBe("fresh.jpg");
    expect([...harness.controller.getSnapshot().filesById.values()][0]).toBe(
      file,
    );
    expect(harness.engine.start).not.toHaveBeenCalled();
  });
});
describe("timeline file intake", () => {
  it("keeps one declaration through StrictMode's mount probe", async () => {
    respondWith({
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      },
    });
    const harness = makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    await renderTimelineInStrictMode();
    const file = new File(["photo"], "strict.jpg", { type: "image/jpeg" });
    await dropFiles(makeDragPayloadFromFiles([file]));
    await waitFor(() => {
      expect(harness.serverDetail.files).toHaveLength(1);
    });
    expect([...harness.controller.getSnapshot().filesById.values()][0]).toBe(
      file,
    );
  });
});
describe("timeline file intake", () => {
  it("keeps newly dropped files while an existing upload is running", async () => {
    const harness = makeEmptyHarness();
    const existing = new File(["photo"], "existing.jpg", {
      type: "image/jpeg",
    });
    await harness.controller.pickFiles([existing]);
    const transfer = harness.controller.startUpload({
      mode: "everyone",
      subjects: [],
    });
    await waitFor(() => {
      expect(harness.controller.getSnapshot().isRunning).toBe(true);
    });
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("27");
    try {
      await dropFiles(
        makeDragPayloadFromFiles([
          new File(["photo"], "later.jpg", { type: "image/jpeg" }),
        ]),
      );
      await screen.findByText(/Your dropped files are kept here/);
      expect(harness.controller.getSnapshot().isRunning).toBe(true);
      expect([...harness.controller.getSnapshot().filesById.values()][0]).toBe(
        existing,
      );
      expect(
        harness.serverDetail.files.map((row) => {
          return row.originalFilename;
        }),
      ).toEqual(["existing.jpg"]);
    } finally {
      harness.answerRun();
      await transfer;
    }
  });
});
describe("timeline file intake", () => {
  it("reads nested directories and every directory-reader batch", async () => {
    const harness = makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("27");
    const files = [
      new File(["a"], "first.jpg", { type: "image/jpeg" }),
      new File(["b"], "second.jpg", { type: "image/jpeg" }),
      new File(["c"], "nested.mp4", { type: "video/mp4" }),
    ];
    const nested = makeDirectoryEntryFromBatches("nested", [
      [makeFileEntryFromFile(files[2]!)],
    ]);
    const directory = makeDirectoryEntryFromBatches("folder", [
      [makeFileEntryFromFile(files[0]!), nested],
      [makeFileEntryFromFile(files[1]!)],
    ]);
    await dropFiles({
      dataTransfer: {
        files: [],
        types: ["Files"],
        items: [
          {
            kind: "file",
            type: "",
            getAsFile: () => {
              return null;
            },
            webkitGetAsEntry: () => {
              return directory;
            },
          },
        ],
      },
    });
    await waitFor(() => {
      expect(
        harness.serverDetail.files
          .map((row) => {
            return row.originalFilename;
          })
          .sort(),
      ).toEqual(["first.jpg", "nested.mp4", "second.jpg"]);
    });
    const handles = [...harness.controller.getSnapshot().filesById.values()];
    files.forEach((file) => {
      expect(
        handles.some((handle) => {
          return handle === file;
        }),
      ).toBe(true);
    });
  });
});
describe("timeline file intake", () => {
  it("opens Upload with the original single file already declared", async () => {
    const harness = makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const { router } = renderTimeline();
    await screen.findByText("27");
    const file = new File(["photo"], "birthday.jpg", { type: "image/jpeg" });
    await dropFiles(makeDragPayloadFromFiles([file]));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/upload");
      expect(harness.controller.getSnapshot().phase).toBe("draft");
    });
    expect([...harness.controller.getSnapshot().filesById.values()]).toEqual([
      file,
    ]);
    expect(
      harness.serverDetail.files.map((row) => {
        return row.originalFilename;
      }),
    ).toEqual(["birthday.jpg"]);
    expect(harness.controller.getSnapshot().isRunning).toBe(false);
    expect(
      screen.queryByText("Drop photos and videos here"),
    ).not.toBeInTheDocument();
  });
});
describe("timeline file intake", () => {
  it("accepts multiple files from an uploader's empty timeline", async () => {
    respondWith({
      "GET /api/me": {
        body: createMeResponse({ role: "uploader" }),
        status: 200,
      },
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      },
    });
    const harness = makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("Nothing on the door yet.");
    const files = [
      new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
      new File(["video"], "video.mp4", { type: "video/mp4" }),
    ];
    await dropFiles(makeDragPayloadFromFiles(files));
    await waitFor(() => {
      expect(
        harness.serverDetail.files.map((row) => {
          return row.originalFilename;
        }),
      ).toEqual(["photo.jpg", "video.mp4"]);
    });
    const handles = [...harness.controller.getSnapshot().filesById.values()];
    files.forEach((file, position) => {
      expect(handles[position]).toBe(file);
    });
  });
});
describe("timeline file intake", () => {
  it("does not capture files for a viewer", async () => {
    respondWith({
      "GET /api/me": {
        body: createMeResponse({ role: "viewer" }),
        status: 200,
      },
    });
    const harness = makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const { router } = renderTimeline();
    await screen.findByText("27");
    await dropFiles(
      makeDragPayloadFromFiles([
        new File(["photo"], "private.jpg", { type: "image/jpeg" }),
      ]),
    );
    expect(router.state.location.pathname).toBe("/");
    expect(harness.controller.getSnapshot().filesById.size).toBe(0);
    expect(
      screen.queryByRole("region", { name: "Drop files to upload" }),
    ).not.toBeInTheDocument();
  });
});
