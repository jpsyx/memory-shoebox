import { createMeResponse } from "@/testing/createMeResponse";
import { renderTimelineInStrictMode } from "@/routes/rendering/__tests__/renderingFixtureHelpers";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
  makeUploadRecoveryControllerHarness,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderTimeline, respondWith } from "./TimelineSurface.fixtures";

function _makeDragPayloadFromFiles(files: readonly File[]) {
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

async function _dropFiles(
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

type DroppedEntry = {
  name: string;
  fullPath: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (success: (file: File) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: DroppedEntry[]) => void) => void;
  };
};

function _makeFileEntryFromFile(file: File): DroppedEntry {
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

function _makeDirectoryEntryFromBatches(
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

function _makeEmptyHarness() {
  return makeUploadControllerHarness(
    makeUploadSurfaceDetail({ files: [], fileCount: 0, totalBytes: 0 }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  respondWith();
});

describe("timeline file intake", () => {
  it("opens a fresh draft for files dropped after a completed upload", async () => {
    const harness = _makeEmptyHarness();
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
    await _dropFiles(_makeDragPayloadFromFiles([file]));
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
    await _dropFiles(_makeDragPayloadFromFiles(harness.files));
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

  it("keeps one declaration through StrictMode's mount probe", async () => {
    respondWith({
      "GET /api/timeline": {
        body: { days: [], nextCursor: null, resultCount: null },
        status: 200,
      },
    });
    const harness = _makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    await renderTimelineInStrictMode();
    const file = new File(["photo"], "strict.jpg", { type: "image/jpeg" });
    await _dropFiles(_makeDragPayloadFromFiles([file]));
    await waitFor(() => {
      expect(harness.serverDetail.files).toHaveLength(1);
    });
    expect([...harness.controller.getSnapshot().filesById.values()][0]).toBe(
      file,
    );
  });

  it("keeps newly dropped files while an existing upload is running", async () => {
    const harness = _makeEmptyHarness();
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
      await _dropFiles(
        _makeDragPayloadFromFiles([
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
  it("reads nested directories and every directory-reader batch", async () => {
    const harness = _makeEmptyHarness();
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
    const nested = _makeDirectoryEntryFromBatches("nested", [
      [_makeFileEntryFromFile(files[2]!)],
    ]);
    const directory = _makeDirectoryEntryFromBatches("folder", [
      [_makeFileEntryFromFile(files[0]!), nested],
      [_makeFileEntryFromFile(files[1]!)],
    ]);
    await _dropFiles({
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
  it("opens Upload with the original single file already declared", async () => {
    const harness = _makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const { router } = renderTimeline();
    await screen.findByText("27");
    const file = new File(["photo"], "birthday.jpg", { type: "image/jpeg" });
    await _dropFiles(_makeDragPayloadFromFiles([file]));
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

  it("accepts multiple files from an uploader's empty timeline", async () => {
    respondWith({
      "GET /api/me": {
        body: createMeResponse({ role: "uploader" }),
        status: 200,
      },
      "GET /api/timeline": {
        body: { days: [], nextCursor: null, resultCount: null },
        status: 200,
      },
    });
    const harness = _makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("Nothing on the door yet.");
    const files = [
      new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
      new File(["video"], "video.mp4", { type: "video/mp4" }),
    ];
    await _dropFiles(_makeDragPayloadFromFiles(files));
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

  it("keeps dropped originals while the saved batch read fails and is retried", async () => {
    const harness = _makeEmptyHarness();
    harness.api.getCurrentUploadSession.mockRejectedValueOnce(
      new Error("Catalog unavailable"),
    );
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    renderTimeline();
    await screen.findByText("27");
    const file = new File(["photo"], "retained.jpg", { type: "image/jpeg" });
    await _dropFiles(_makeDragPayloadFromFiles([file]));
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

  it("waits for the initial read before declaring each dropped file once", async () => {
    const harness = _makeEmptyHarness();
    const read = makeDeferredAnswer<null>();
    harness.api.getCurrentUploadSession.mockReturnValueOnce(read.promise);
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const { router } = renderTimeline();
    await screen.findByText("27");
    const file = new File(["photo"], "delayed.jpg", { type: "image/jpeg" });
    await _dropFiles(_makeDragPayloadFromFiles([file]));
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

  it("does not capture files for a viewer", async () => {
    respondWith({
      "GET /api/me": {
        body: createMeResponse({ role: "viewer" }),
        status: 200,
      },
    });
    const harness = _makeEmptyHarness();
    vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
      harness.controller,
    );
    const { router } = renderTimeline();
    await screen.findByText("27");
    await _dropFiles(
      _makeDragPayloadFromFiles([
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
