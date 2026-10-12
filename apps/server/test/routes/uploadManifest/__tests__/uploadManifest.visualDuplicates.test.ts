import { describe, expect, it } from "vitest";
import {
  makeVisualFingerprintFromRgba,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";
import { insertItem } from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  makeEntry,
  makeHash,
  readFiles,
  setUpUploadTestContext,
} from "./uploadManifestTestHelpers.ts";

function _makeFingerprint(seed = 2): string {
  return makeVisualFingerprintFromRgba(
    Uint8Array.from({ length: 4096 }, (_, index) => {
      const pixel = Math.floor(index / 4);
      return index % 4 === 3
        ? 255
        : Math.round(
            120 +
              55 * Math.sin((pixel % 32) / (seed + 2) + (index % 4)) +
              50 * Math.cos(Math.floor(pixel / 32) / (seed + 3)),
          );
    }),
  )!;
}

describe("visual duplicate drafts", () => {
  it("keeps refusal precedence for separately picked unsupported files with equal checksums", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      const response = await fixture.patchManifest(
        ["first", "copy"].map((pickId) => {
          return makeEntry({
            clientRef: pickId,
            pickId,
            declaredContentType: "application/pdf",
            contentHash: makeHash("pdf"),
          });
        }),
      );
      expect(response.statusCode).toBe(200);
      expect(
        (await readFiles(fixture)).map((file) => {
          return file.state;
        }),
      ).toEqual(["refused", "refused"]);
    } finally {
      await fixture.close();
    }
  });
  it("skips a renamed, resized export before Upload and preserves the notice on replay", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        visual_fingerprint: _makeFingerprint(),
        width: 400,
        height: 300,
        checksum: makeHash("small"),
        byte_size: 1024,
      });
      const entries = [
        makeEntry({
          clientRef: "export",
          pickId: "pick-1",
          contentHash: makeHash("large"),
          declaredBytes: 9000,
          width: 4000,
          height: 3000,
          visualFingerprint: _makeFingerprint(),
        }),
      ];
      const first = await fixture.patchManifest(entries);
      expect(first.statusCode).toBe(200);
      expect(first.json<PutUploadManifestResponse>()).toMatchObject({
        totalBytes: 0,
        outcomes: [{ state: "cancelled" }],
      });
      const replay = await fixture.patchManifest(entries);
      expect(replay.json()).toMatchObject({
        outcomes: [
          {
            fileId: first.json<PutUploadManifestResponse>().outcomes[0]!.fileId,
            state: "cancelled",
          },
        ],
      });
      expect(await readFiles(fixture)).toEqual([
        expect.objectContaining({
          duplicate_reason: "archive",
          visual_fingerprint: _makeFingerprint(),
          storage_key: null,
        }),
      ]);
      expect(fixture.b2.calls).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it.each(["byte", "visual"])(
    "keeps every %s-identical pick visible as a skipped row across request retries",
    async (identity) => {
      const fixture = await setUpUploadTestContext();
      try {
        const entries = ["first", "copy"].map((name) => {
          return makeEntry({
            clientRef: name,
            pickId: name,
            contentHash: makeHash(identity === "byte" ? "same" : name),
            visualFingerprint:
              identity === "visual" ? _makeFingerprint() : undefined,
            width: 400,
            height: 300,
          });
        });
        const response = await fixture.patchManifest(entries);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          outcomes: [{ state: "waiting" }, { state: "cancelled" }],
        });
        await fixture.patchManifest(entries);
        expect(await readFiles(fixture)).toEqual([
          expect.objectContaining({ state: "waiting", duplicate_reason: null }),
          expect.objectContaining({
            state: "cancelled",
            duplicate_reason: "batch",
          }),
        ]);
      } finally {
        await fixture.close();
      }
    },
  );

  it.each([
    {
      label: "different structure",
      fingerprint: _makeFingerprint(6),
      width: 400,
      height: 300,
      declaredContentType: "image/jpeg",
    },
    {
      label: "different aspect ratio",
      fingerprint: _makeFingerprint(),
      width: 300,
      height: 400,
      declaredContentType: "image/jpeg",
    },
    {
      label: "video",
      fingerprint: _makeFingerprint(),
      width: 400,
      height: 300,
      declaredContentType: "video/mp4",
    },
  ])("keeps $label eligible", async ({ fingerprint, ...values }) => {
    const fixture = await setUpUploadTestContext();
    try {
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        visual_fingerprint: _makeFingerprint(),
        width: 400,
        height: 300,
      });
      const response = await fixture.patchManifest([
        makeEntry({
          clientRef: "new",
          contentHash: makeHash("new"),
          visualFingerprint: fingerprint,
          ...values,
        }),
      ]);
      expect(response.json()).toMatchObject({
        outcomes: [{ state: "waiting" }],
      });
    } finally {
      await fixture.close();
    }
  });

  it("checks a previously declared file even when checksum and date amendment arrive together", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      const entry = makeEntry({ clientRef: "legacy", width: 400, height: 300 });
      const declared = await fixture.patchManifest([entry]);
      const fileId =
        declared.json<PutUploadManifestResponse>().outcomes[0]!.fileId;
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        visual_fingerprint: _makeFingerprint(),
        width: 400,
        height: 300,
      });
      const result = await fixture.patchManifest([
        {
          ...entry,
          fileId,
          contentHash: makeHash("export"),
          visualFingerprint: _makeFingerprint(),
          capturedAt: "2026-09-16T00:00:00Z",
        },
      ]);
      expect(result.json()).toMatchObject({
        outcomes: [{ state: "cancelled" }],
      });
    } finally {
      await fixture.close();
    }
  });
});
