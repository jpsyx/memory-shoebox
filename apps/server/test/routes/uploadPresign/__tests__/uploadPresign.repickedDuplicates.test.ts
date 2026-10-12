import { expect, it } from "vitest";
import type { PutUploadManifestResponse } from "@memory-shoebox/shared";
import {
  makeEntry,
  makeHash,
  readFiles,
  setUpUploadTestContext as setUpDraft,
} from "../../uploadManifest/__tests__/uploadManifestTestHelpers.ts";
import {
  HASH,
  MULTIPART_BYTES,
  holdPresignMultipart,
  setUpUploadTestContext,
} from "./uploadPresignTestHelpers.ts";

/** Valid matching evidence independent of original-byte identity. */
const FINGERPRINT = `v1:${"a".repeat(16)}:${"b".repeat(60)}:${"c".repeat(384)}`;

it("uploads a re-picked visual copy after the original pick is removed and preserves the skipped notice", async () => {
  const fixture = await setUpDraft();
  try {
    const entries = ["original", "copy"].map((pickId) => {
      return makeEntry({
        clientRef: pickId,
        pickId,
        contentHash: makeHash(pickId),
        visualFingerprint: FINGERPRINT,
        declaredBytes: 1024,
        width: 400,
        height: 300,
      });
    });
    const declared = await fixture.patchManifest(entries);
    expect(declared.statusCode).toBe(200);
    const outcomes = declared.json<PutUploadManifestResponse>().outcomes;
    expect(outcomes).toMatchObject([
      { state: "waiting" },
      { state: "cancelled" },
    ]);
    const firstId = outcomes[0]!.fileId;
    const skippedId = outcomes[1]!.fileId;
    const removed = await fixture.app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${fixture.sessionId}/files`,
      headers: { cookie: fixture.cookie },
      payload: { fileIds: [firstId] },
    });
    expect(removed.statusCode).toBe(204);
    const repicked = await fixture.patchManifest([
      { ...entries[1]!, clientRef: "repicked", pickId: "repicked" },
    ]);
    expect(repicked.statusCode).toBe(200);
    const repickedOutcome =
      repicked.json<PutUploadManifestResponse>().outcomes[0]!;
    expect(repickedOutcome.state).toBe("waiting");
    expect(
      (await readFiles(fixture)).find((file) => {
        return file.id === repickedOutcome.fileId;
      }),
    ).toMatchObject({ content_hash: null });
    const armed = await fixture.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${fixture.sessionId}/commit`,
      headers: { cookie: fixture.cookie },
      payload: { intent: "arm" },
    });
    expect(armed.statusCode).toBe(200);
    const signed = await fixture.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${fixture.sessionId}/files/${repickedOutcome.fileId}/presign`,
      headers: { cookie: fixture.cookie },
      payload: { contentHash: makeHash("copy"), byteSize: 1024 },
    });
    expect(signed.statusCode).toBe(200);
    expect(await readFiles(fixture)).toEqual([
      expect.objectContaining({
        id: skippedId,
        state: "cancelled",
        duplicate_reason: "batch",
        content_hash: null,
      }),
      expect.objectContaining({
        id: repickedOutcome.fileId,
        state: "sending",
        content_hash: makeHash("copy"),
      }),
    ]);
    const detail = await fixture.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${fixture.sessionId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(detail.json().files).toContainEqual(
      expect.objectContaining({
        fileId: skippedId,
        state: "cancelled",
        duplicateReason: "batch",
      }),
    );
  } finally {
    await fixture.close();
  }
});

it.each(["cancelled", "refused"])(
  "reclaims checksum ownership from a %s row without changing its outcome",
  async (state) => {
    const fixture = await setUpUploadTestContext();
    try {
      const holderId = await fixture.seedFile({
        position: 0,
        state,
        content_hash: HASH,
        problem_detail: "Keep this outcome",
      });
      const fileId = await fixture.seedFile({ position: 1 });
      const signed = await fixture.presign({
        fileId,
        payload: { contentHash: HASH, byteSize: 1024 },
      });
      expect(signed.statusCode).toBe(200);
      expect(await fixture.readFile(holderId)).toMatchObject({
        state,
        content_hash: null,
        problem_detail: "Keep this outcome",
      });
      expect(await fixture.readFile(fileId)).toMatchObject({
        state: "sending",
        content_hash: HASH,
      });
    } finally {
      await fixture.close();
    }
  },
);

it.each(["waiting", "sending", "done", "failed"])(
  "continues skipping an actual duplicate held by a %s row",
  async (state) => {
    const fixture = await setUpUploadTestContext();
    try {
      const holderId = await fixture.seedFile({
        position: 0,
        state,
        content_hash: HASH,
      });
      const fileId = await fixture.seedFile({ position: 1 });
      const signed = await fixture.presign({
        fileId,
        payload: { contentHash: HASH, byteSize: 1024 },
      });
      expect(signed.statusCode).toBe(409);
      expect(await fixture.readFile(holderId)).toMatchObject({
        state,
        content_hash: HASH,
      });
      expect(await fixture.readFile(fileId)).toMatchObject({
        state: "cancelled",
        duplicate_reason: "batch",
        content_hash: null,
      });
      expect(fixture.b2.calls).toEqual([]);
    } finally {
      await fixture.close();
    }
  },
);

it("lets only one racing re-pick take a cancelled row's checksum", async () => {
  const fixture = await setUpUploadTestContext();
  try {
    const holderId = await fixture.seedFile({
      position: 0,
      state: "cancelled",
      content_hash: HASH,
      declared_bytes: MULTIPART_BYTES,
    });
    const firstId = await fixture.seedFile({
      position: 1,
      declared_bytes: MULTIPART_BYTES,
    });
    const secondId = await fixture.seedFile({
      position: 2,
      declared_bytes: MULTIPART_BYTES,
    });
    holdPresignMultipart({ b2: fixture.b2, heldCount: 2 });
    const responses = await Promise.all(
      [firstId, secondId].map((fileId) => {
        return fixture.presign({
          fileId,
          payload: { contentHash: HASH, byteSize: MULTIPART_BYTES },
        });
      }),
    );
    expect(
      responses
        .map((response) => {
          return response.statusCode;
        })
        .sort(),
    ).toEqual([200, 409]);
    expect(await fixture.readFile(holderId)).toMatchObject({
      state: "cancelled",
      content_hash: null,
    });
    const rows = await fixture.database
      .selectFrom("upload_files")
      .select(["state", "content_hash"])
      .where("id", "in", [firstId, secondId])
      .orderBy("state")
      .execute();
    expect(rows).toEqual([
      { state: "cancelled", content_hash: null },
      { state: "sending", content_hash: HASH },
    ]);
    expect(
      fixture.b2.calls.filter((call) => {
        return call === "abortMultipart";
      }),
    ).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});

it("preserves a failed file's identity and rejects different bytes on retry", async () => {
  const fixture = await setUpUploadTestContext();
  try {
    const holderId = await fixture.seedFile({
      position: 0,
      state: "failed",
      content_hash: HASH,
      visual_fingerprint: FINGERPRINT,
    });
    const fileId = await fixture.seedFile({ position: 1 });
    const competing = await fixture.presign({
      fileId,
      payload: { contentHash: HASH, byteSize: 1024 },
    });
    const retried = await fixture.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${fixture.sessionId}/files/${holderId}/retry`,
      headers: { cookie: fixture.cookie },
    });
    expect(retried.statusCode).toBe(200);
    const changedBytes = await fixture.presign({
      fileId: holderId,
      payload: { contentHash: makeHash("different original"), byteSize: 1024 },
    });
    expect(changedBytes.statusCode).toBe(400);
    expect(await fixture.readFile(holderId)).toMatchObject({
      state: "waiting",
      content_hash: HASH,
      visual_fingerprint: FINGERPRINT,
    });
    expect(competing.statusCode).toBe(409);
    expect(
      (
        await fixture.presign({
          fileId: holderId,
          payload: { contentHash: HASH, byteSize: 1024 },
        })
      ).statusCode,
    ).toBe(200);
    expect(await fixture.readFile(holderId)).toMatchObject({
      state: "sending",
      content_hash: HASH,
      visual_fingerprint: FINGERPRINT,
    });
  } finally {
    await fixture.close();
  }
});

it("does not release inactive checksum ownership if signing fails", async () => {
  const fixture = await setUpUploadTestContext();
  try {
    const holderId = await fixture.seedFile({
      position: 0,
      state: "cancelled",
      content_hash: HASH,
    });
    const fileId = await fixture.seedFile({ position: 1 });
    fixture.b2.presignPut = async () => {
      throw new Error("storage unavailable");
    };
    expect(
      (
        await fixture.presign({
          fileId,
          payload: { contentHash: HASH, byteSize: 1024 },
        })
      ).statusCode,
    ).toBe(503);
    expect(await fixture.readFile(holderId)).toMatchObject({
      state: "cancelled",
      content_hash: HASH,
    });
    expect(await fixture.readFile(fileId)).toMatchObject({
      state: "waiting",
      content_hash: null,
    });
  } finally {
    await fixture.close();
  }
});
