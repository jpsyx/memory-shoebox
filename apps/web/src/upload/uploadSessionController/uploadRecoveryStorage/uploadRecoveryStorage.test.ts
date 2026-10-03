import { describe, expect, it } from "vitest";
import {
  makeUploadRecoveryStorage,
  makeUploadSurfaceDetail,
} from "../__tests__/uploadSurfaceFixtures";
import {
  clearUploadRecoveryHint,
  getEditTargetsFromRecoveryHint,
  readUploadRecoveryHint,
  writeUploadRecoveryHint,
} from "./uploadRecoveryStorage";

const memberId = "018f0000-0000-7000-8000-000000000001";
const sessionId = "018f0000-0000-7000-8000-00000000c001";
const editId = "018f0000-0000-7000-8000-00000000e001";
const hint = { version: 1 as const, sessionId, editTargets: {} };

describe("uploadRecoveryStorage", () => {
  it("hints survive blocked or corrupt storage", () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(
      readUploadRecoveryHint({ storage: brokenStorage, memberId }),
    ).toBeUndefined();
    expect(() => {
      return writeUploadRecoveryHint({
        storage: brokenStorage,
        memberId,
        hint,
      });
    }).not.toThrow();
    expect(() => {
      return clearUploadRecoveryHint({ storage: brokenStorage, memberId });
    }).not.toThrow();
    const corruptStorage = {
      ...brokenStorage,
      getItem: () => {
        return "{bad JSON";
      },
    };
    expect(
      readUploadRecoveryHint({ storage: corruptStorage, memberId }),
    ).toBeUndefined();
  });

  it("isolates members and clears remembered sessions", () => {
    const storage = makeUploadRecoveryStorage();
    writeUploadRecoveryHint({ storage, memberId, hint });
    expect(readUploadRecoveryHint({ storage, memberId })).toEqual(hint);
    const otherMemberHint = readUploadRecoveryHint({
      storage,
      memberId: "another-member",
    });
    expect(otherMemberHint).toBeUndefined();
    clearUploadRecoveryHint({ storage, memberId });
    expect(readUploadRecoveryHint({ storage, memberId })).toBeUndefined();
  });

  it.each([
    { ...hint, version: 2 },
    { ...hint, sessionId: "bad" },
    { ...hint, editTargets: { [editId]: ["invalid-file"] } },
    { ...hint, editTargets: { [editId]: [] }, files: ["media"] },
  ])("ignores invalid or foreign-shaped saved values", (value) => {
    const storage = {
      ...makeUploadRecoveryStorage(),
      getItem: () => {
        return JSON.stringify(value);
      },
    };
    expect(readUploadRecoveryHint({ storage, memberId })).toBeUndefined();
  });

  it("restores only markers matching live edit ids and counts", () => {
    const detail = makeUploadSurfaceDetail();
    const fileId = detail.files[0]!.fileId;
    const edit = {
      editId,
      kind: "tag" as const,
      label: "Holiday",
      tag: null,
      person: null,
      milestone: null,
      targetCount: 1,
      createdAt: detail.createdAt,
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
    detail.edits = [edit];
    const saved = { ...hint, editTargets: { [editId]: [fileId] } };
    expect(getEditTargetsFromRecoveryHint({ hint: saved, detail })).toEqual(
      new Map([[editId, [fileId]]]),
    );
    expect(
      getEditTargetsFromRecoveryHint({
        hint: saved,
        detail: { ...detail, edits: [{ ...edit, targetCount: 2 }] },
      }),
    ).toEqual(new Map());
    expect(
      getEditTargetsFromRecoveryHint({
        hint: saved,
        detail: { ...detail, edits: [{ ...edit, undoneAt: detail.createdAt }] },
      }),
    ).toEqual(new Map());
    expect(
      getEditTargetsFromRecoveryHint({
        hint: saved,
        detail: { ...detail, sessionId: "different" },
      }),
    ).toEqual(new Map());
    expect(
      getEditTargetsFromRecoveryHint({
        hint: { ...saved, editTargets: { [editId]: [fileId, fileId] } },
        detail,
      }),
    ).toEqual(new Map());
    expect(
      getEditTargetsFromRecoveryHint({
        hint: saved,
        detail: { ...detail, files: [] },
      }),
    ).toEqual(new Map());
  });
});
