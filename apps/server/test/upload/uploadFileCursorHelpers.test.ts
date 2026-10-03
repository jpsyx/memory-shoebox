import { describe, expect, it } from "vitest";
import {
  getPositionFromUploadFileCursor,
  makeUploadFileCursorFromPosition,
} from "../../src/upload/uploadFileCursorHelpers.ts";

describe("the upload file cursor", () => {
  it("round-trips a position, the first row's included", () => {
    expect(
      getPositionFromUploadFileCursor(makeUploadFileCursorFromPosition(0)),
    ).toBe(0);
    expect(
      getPositionFromUploadFileCursor(makeUploadFileCursorFromPosition(263)),
    ).toBe(263);
  });

  it("is opaque base64url, safe in a query string as it stands", () => {
    expect(makeUploadFileCursorFromPosition(263)).toMatch(/^[\w-]+$/u);
  });

  it("answers nothing for a cursor it did not issue", () => {
    expect(getPositionFromUploadFileCursor("not-a-cursor")).toBeUndefined();
    expect(
      getPositionFromUploadFileCursor(
        Buffer.from(JSON.stringify({ p: -1 })).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(
      getPositionFromUploadFileCursor(
        Buffer.from(JSON.stringify({ i: "an-id" })).toString("base64url"),
      ),
    ).toBeUndefined();
  });
});
