import { describe, expect, it } from "vitest";
import { createId } from "../../../../src/db/createId.ts";
import {
  insertUploadFile,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  JPEG,
  setUpUploadTestContext,
  holdHeadObjectsUntilTwoAreAsked,
} from "./uploadCompleteTestHelpers.ts";

describe("completing duplicate originals", () => {
  it("serializes simultaneous batches so only one new item lands and only losing objects are queued", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      const first = await fixture.seedFile({ position: 0 });
      const other = await insertSignedInMember({
        database: fixture.database,
        token: "other-uploader",
      });
      const otherSessionId = await insertUploadSession(fixture.database, {
        uploadedBy: other.memberId,
      });
      const secondId = createId();
      const secondKey = `uploads/${otherSessionId}/${secondId}/original.jpg`;
      const original = await fixture.readFile(first.fileId);
      await insertUploadFile(fixture.database, {
        ...original,
        id: secondId,
        uploadSessionId: otherSessionId,
        upload_session_id: otherSessionId,
        storage_key: secondKey,
      });
      [first.keyOf("original"), secondKey].forEach((key) => {
        fixture.b2.storedObjects.set(key, {
          sizeBytes: 1024,
          contentType: JPEG,
        });
      });
      holdHeadObjectsUntilTwoAreAsked({ b2: fixture.b2 });
      const payload = {
        outcome: "done",
        contentHash: first.contentHash,
        byteSize: 1024,
        width: 4032,
        height: 3024,
        renditions: [],
      };
      const responses = await Promise.all([
        fixture.complete({ fileId: first.fileId, payload }),
        fixture.app.inject({
          method: "POST",
          url: `/api/upload-sessions/${otherSessionId}/files/${secondId}/complete`,
          headers: { cookie: other.cookie },
          payload,
        }),
      ]);
      expect(
        responses
          .map((response) => {
            return response.statusCode;
          })
          .sort(),
      ).toEqual([200, 409]);
      expect(await fixture.countItems()).toBe(1);
      const files = await fixture.database
        .selectFrom("upload_files")
        .selectAll()
        .execute();
      const loser = files.find((file) => {
        return file.state === "cancelled";
      });
      const winner = files.find((file) => {
        return file.state === "done";
      });
      expect(loser).toMatchObject({
        duplicate_reason: "archive",
        item_id: null,
      });
      expect(winner?.item_id).toBeTruthy();
      const queued = await fixture.database
        .selectFrom("pending_object_deletions")
        .select("storage_key")
        .execute();
      expect(
        queued.map((row) => {
          return row.storage_key;
        }),
      ).toContain(loser?.storage_key);
      expect(
        queued.map((row) => {
          return row.storage_key;
        }),
      ).not.toContain(winner?.storage_key);
      const repeat = await fixture.app.inject({
        method: "POST",
        url: `/api/upload-sessions/${loser?.upload_session_id}/files/${loser?.id}/complete`,
        headers: {
          cookie: loser?.id === first.fileId ? fixture.cookie : other.cookie,
        },
        payload,
      });
      expect(repeat.statusCode).toBe(409);
      expect(repeat.json().details).toMatchObject({
        fileId: loser?.id,
        state: "cancelled",
      });
    } finally {
      await fixture.close();
    }
  });
});
