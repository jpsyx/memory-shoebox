import { describe, expect, it } from "vitest";
import { makeUploadStorageKeyFromRendition } from "../../src/upload/presignUploadFile.ts";

describe("makeUploadStorageKeyFromRendition", () => {
  it("keys an original by its declared type and every derivative as a JPEG", () => {
    const keyFor = (
      purpose: "original" | "thumb",
      declaredContentType: string,
    ) => {
      return makeUploadStorageKeyFromRendition({
        sessionId: "session",
        fileId: "file",
        purpose,
        declaredContentType,
      });
    };

    expect(keyFor("original", "image/heic")).toBe(
      "uploads/session/file/original.heic",
    );
    expect(keyFor("original", "video/quicktime")).toBe(
      "uploads/session/file/original.mov",
    );
    expect(keyFor("original", "IMAGE/JPEG")).toBe(
      "uploads/session/file/original.jpg",
    );
    expect(keyFor("thumb", "image/heic")).toBe(
      "uploads/session/file/thumb.jpg",
    );
  });
});
