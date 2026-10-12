import { describe, expect, it } from "vitest";
import { type PutUploadManifestResponse } from "@memory-shoebox/shared";
import {
  insertItem,
  insertMember,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  makeEntry,
  makeHash,
  readFiles,
  setUpUploadTestContext,
} from "./uploadManifestTestHelpers.ts";

describe("archive duplicates in an upload draft", () => {
  it.each([true, false])(
    "checks a previously hashless draft when its original is picked again (addressed=%s)",
    async (isAddressed) => {
      const fixture = await setUpUploadTestContext();
      try {
        const entry = makeEntry({ clientRef: "original", declaredBytes: 1024 });
        const first = await fixture.patchManifest([entry]);
        const fileId =
          first.json<PutUploadManifestResponse>().outcomes[0]!.fileId;
        await insertItem(fixture.database, {
          uploadedBy: fixture.memberId,
          checksum: makeHash("original"),
          byte_size: 1024,
        });
        const response = await fixture.patchManifest([
          {
            ...entry,
            ...(isAddressed ? { fileId } : {}),
            contentHash: makeHash("original"),
          },
        ]);
        expect(response.statusCode).toBe(200);
        expect(
          response.json<PutUploadManifestResponse>().outcomes[0],
        ).toMatchObject({ fileId, state: "cancelled" });
        const replay = await fixture.patchManifest([
          {
            ...entry,
            ...(isAddressed ? { fileId } : {}),
            contentHash: makeHash("original"),
          },
        ]);
        expect(
          replay.json<PutUploadManifestResponse>().outcomes[0],
        ).toMatchObject({ fileId, state: "cancelled" });
        expect(await readFiles(fixture)).toEqual([
          expect.objectContaining({
            id: fileId,
            state: "cancelled",
            duplicate_reason: "archive",
          }),
        ]);
      } finally {
        await fixture.close();
      }
    },
  );
  it("keeps skipped bytes out of the committed total", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        checksum: makeHash("existing"),
        byte_size: 1024,
      });
      await fixture.patchManifest([
        makeEntry({
          clientRef: "existing",
          contentHash: makeHash("existing"),
          declaredBytes: 1024,
        }),
        makeEntry({
          clientRef: "new",
          contentHash: makeHash("new"),
          declaredBytes: 2048,
        }),
      ]);
      const response = await fixture.app.inject({
        method: "POST",
        url: `/api/upload-sessions/${fixture.sessionId}/commit`,
        headers: { cookie: fixture.cookie },
        payload: { intent: "arm" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        state: "uploading",
        totalBytes: 2048,
        progress: { waitingCount: 1, cancelledCount: 1 },
      });
    } finally {
      await fixture.close();
    }
  });
  it("flags renamed identical bytes before Upload and preserves the verdict on replay and reload", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      const itemId = await insertItem(fixture.database, {
        uploadedBy: await insertMember(fixture.database),
        checksum: makeHash("original bytes"),
        byte_size: 1024,
        original_filename: "private-name.jpg",
      });
      const entries = [
        makeEntry({
          clientRef: "renamed",
          originalFilename: "renamed.jpg",
          contentHash: makeHash("original bytes"),
          declaredBytes: 1024,
        }),
      ];
      const first = await fixture.patchManifest(entries);
      expect(first.statusCode).toBe(200);
      expect(first.json<PutUploadManifestResponse>()).toMatchObject({
        totalBytes: 0,
        outcomes: [{ state: "cancelled" }],
      });
      const replay = await fixture.patchManifest(entries);
      expect(
        replay.json<PutUploadManifestResponse>().outcomes[0],
      ).toMatchObject({
        fileId: first.json<PutUploadManifestResponse>().outcomes[0]!.fileId,
        state: "cancelled",
        disposition: "matched",
      });
      expect(await readFiles(fixture)).toEqual([
        expect.objectContaining({
          state: "cancelled",
          duplicate_reason: "archive",
          item_id: null,
          attempt_count: 0,
          storage_key: null,
        }),
      ]);
      const detail = await fixture.app.inject({
        method: "GET",
        url: `/api/upload-sessions/${fixture.sessionId}`,
        headers: { cookie: fixture.cookie },
      });
      expect(detail.json()).toMatchObject({
        state: "draft",
        files: [{ state: "cancelled", duplicateReason: "archive" }],
      });
      expect(detail.body).not.toContain(itemId);
      expect(detail.body).not.toContain("private-name.jpg");
      expect(fixture.b2.calls).toEqual([]);
      expect(
        await fixture.database
          .selectFrom("outbound_emails")
          .select("id")
          .execute(),
      ).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it.each([
    {
      label: "same name and size with different bytes",
      hash: makeHash("different bytes"),
      size: 1024,
    },
    {
      label: "same photo exported at another size",
      hash: makeHash("reencoded bytes"),
      size: 4096,
    },
    {
      label: "inconsistent size despite a matching checksum",
      hash: makeHash("original bytes"),
      size: 2048,
    },
  ])("keeps $label eligible", async ({ hash, size }) => {
    const fixture = await setUpUploadTestContext();
    try {
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        checksum: makeHash("original bytes"),
        byte_size: 1024,
        original_filename: "same.jpg",
      });
      const response = await fixture.patchManifest([
        makeEntry({
          clientRef: "different",
          originalFilename: "same.jpg",
          contentHash: hash,
          declaredBytes: size,
        }),
      ]);
      expect(
        response.json<PutUploadManifestResponse>().outcomes[0]?.state,
      ).toBe("waiting");
      expect((await readFiles(fixture))[0]?.duplicate_reason).toBeNull();
    } finally {
      await fixture.close();
    }
  });
});
