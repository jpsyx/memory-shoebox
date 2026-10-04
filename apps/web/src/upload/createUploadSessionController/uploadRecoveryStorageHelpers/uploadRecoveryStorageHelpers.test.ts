import type { UploadRecoveryHint } from "../createUploadSessionController.types";
import { describe, expect, it } from "vitest";
import {
  makeUploadRecoveryStorage,
  makeUploadSurfaceDetail,
} from "../__tests__/uploadSurfaceFixtureHelpers";
import {
  clearUploadRecoveryHint,
  getEditTargetsFromRecoveryHint,
  getUploadRecoveryHintFromStorage,
  writeUploadRecoveryHint,
} from "./uploadRecoveryStorageHelpers";

const MEMBER_ID = "018f0000-0000-7000-8000-000000000001";
const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";
const EDIT_ID = "018f0000-0000-7000-8000-00000000e001";
const hint: UploadRecoveryHint = {
  version: 1,
  sessionId: SESSION_ID,
  editTargets: {},
};

describe("uploadRecoveryStorage", () => {
  it("blocked or corrupt storage reads are empty and writes do not throw", () => {
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
      getUploadRecoveryHintFromStorage({
        storage: brokenStorage,
        memberId: MEMBER_ID,
      }),
    ).toBeUndefined();
    expect(() => {
      return writeUploadRecoveryHint({
        storage: brokenStorage,
        memberId: MEMBER_ID,
        hint,
      });
    }).not.toThrow();
    expect(() => {
      return clearUploadRecoveryHint({
        storage: brokenStorage,
        memberId: MEMBER_ID,
      });
    }).not.toThrow();
    const corruptStorage = {
      ...brokenStorage,
      getItem: () => {
        return "{bad JSON";
      },
    };
    expect(
      getUploadRecoveryHintFromStorage({
        storage: corruptStorage,
        memberId: MEMBER_ID,
      }),
    ).toBeUndefined();
  });

  it("isolates members and clears remembered sessions", () => {
    const storage = makeUploadRecoveryStorage();
    writeUploadRecoveryHint({ storage, memberId: MEMBER_ID, hint });
    expect(
      getUploadRecoveryHintFromStorage({ storage, memberId: MEMBER_ID }),
    ).toEqual(hint);
    const otherMemberHint = getUploadRecoveryHintFromStorage({
      storage,
      memberId: "another-member",
    });
    expect(otherMemberHint).toBeUndefined();
    clearUploadRecoveryHint({ storage, memberId: MEMBER_ID });
    expect(
      getUploadRecoveryHintFromStorage({ storage, memberId: MEMBER_ID }),
    ).toBeUndefined();
  });

  it.each([
    { ...hint, version: 2 },
    { ...hint, sessionId: "bad" },
    { ...hint, editTargets: { [EDIT_ID]: ["invalid-file"] } },
    { ...hint, editTargets: { [EDIT_ID]: [] }, files: ["media"] },
  ])("ignores invalid or foreign-shaped saved values", (value) => {
    const storage = {
      ...makeUploadRecoveryStorage(),
      getItem: () => {
        return JSON.stringify(value);
      },
    };
    expect(
      getUploadRecoveryHintFromStorage({ storage, memberId: MEMBER_ID }),
    ).toBeUndefined();
  });

  it("restores only markers matching live edit ids and counts", () => {
    const detail = makeUploadSurfaceDetail();
    const fileId = detail.files[0]!.fileId;
    const edit = {
      editId: EDIT_ID,
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
    const saved = { ...hint, editTargets: { [EDIT_ID]: [fileId] } };
    expect(getEditTargetsFromRecoveryHint({ hint: saved, detail })).toEqual(
      new Map([[EDIT_ID, [fileId]]]),
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
        hint: { ...saved, editTargets: { [EDIT_ID]: [fileId, fileId] } },
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
