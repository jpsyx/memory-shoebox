import { describe, expect, it } from "vitest";
import * as shared from "../../../src/index.ts";
import { FILE_ID } from "./uploadTestFixtures.constants.ts";

describe("removeUploadFilesRequestSchema", () => {
  it("requires a nonempty bounded list of upload file ids", () => {
    const schema = shared.removeUploadFilesRequestSchema;
    expect(schema.parse({ fileIds: [FILE_ID] })).toEqual({
      fileIds: [FILE_ID],
    });
    expect(schema.safeParse({ fileIds: [] }).success).toBe(false);
    expect(schema.safeParse({ fileIds: ["bad-id"] }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(
      schema.safeParse({
        fileIds: Array.from(
          { length: shared.UPLOAD_LIMITS.manifestEntriesPerRequest },
          () => {
            return FILE_ID;
          },
        ),
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        fileIds: Array.from(
          { length: shared.UPLOAD_LIMITS.manifestEntriesPerRequest + 1 },
          () => {
            return FILE_ID;
          },
        ),
      }).success,
    ).toBe(false);
  });
});
