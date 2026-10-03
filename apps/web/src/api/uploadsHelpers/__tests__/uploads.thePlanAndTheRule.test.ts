import {
  SESSION_ID,
  FILE_ID,
  EDIT_ID,
  AT,
  SESSION_DETAIL,
  EDIT_DTO,
  respondWith,
  onlyCall,
} from "./uploadsTestHelpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateUploadEditRequest } from "@memory-shoebox/shared";
import { ZodError } from "zod";

import {
  createUploadEdit,
  getUploadSession,
  setUploadVisibility,
  undoUploadEdit,
} from "@/api/uploadsHelpers/uploadsHelpers";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the plan and the rule", () => {
  it("patches the visibility rule and parses the summary", async () => {
    respondWith({ body: SESSION_DETAIL.visibility, status: 200 });

    const summary = await setUploadVisibility({
      sessionId: SESSION_ID,
      body: { mode: "everyone", subjects: [] },
    });

    expect(summary.mode).toBe("everyone");
    const { url, init } = onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/visibility`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ mode: "everyone", subjects: [] }));
  });

  it("posts one bulk action and parses the edit", async () => {
    respondWith({ body: EDIT_DTO, status: 201 });

    const body: CreateUploadEditRequest = {
      kind: "tag",
      targetFileIds: [FILE_ID],
      labelSnapshot: "Hospital",
    };

    const edit = await createUploadEdit({ sessionId: SESSION_ID, body });

    expect(edit.targetCount).toBe(12);
    const { url, init } = onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/edits`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("undoes one with a DELETE that still answers the edit", async () => {
    respondWith({
      body: { ...EDIT_DTO, undoneAt: AT, canUndo: false },
      status: 200,
    });

    const edit = await undoUploadEdit({
      sessionId: SESSION_ID,
      editId: EDIT_ID,
    });

    expect(edit.canUndo).toBe(false);
    const { url, init } = onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/edits/${EDIT_ID}`);
    expect(init.method).toBe("DELETE");
  });
});

describe("a response that has drifted from its schema", () => {
  it("throws at the boundary rather than handing back a partial detail", async () => {
    const { progress: _progress, ...detailWithoutProgress } = SESSION_DETAIL;
    respondWith({ body: detailWithoutProgress, status: 200 });

    await expect(
      getUploadSession({ sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
