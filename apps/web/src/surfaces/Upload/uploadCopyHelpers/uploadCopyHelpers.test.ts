import { describe, expect, it } from "vitest";
import { uploadProblemCopy } from "./uploadCopyHelpers";
describe("upload explanations", () => {
  it("distinguishes refusal, transport, content and storage failures", () => {
    const codes = [
      "unsupported_type",
      "empty_file",
      "too_large",
      "connection_lost",
      "abandoned",
      "checksum_mismatch",
      "content_mismatch",
      "storage_rejected",
      "upload_storage_unavailable",
    ] as const;
    const copies = codes.map(uploadProblemCopy);
    expect(new Set(copies).size).toBe(codes.length);
    expect(
      copies.every((copy) => {
        return copy.length > 15;
      }),
    ).toBe(true);
  });
});
