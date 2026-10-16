import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, it } from "vitest";
import type { ManifestEntry } from "@memory-shoebox/shared";
import { makeVisualFingerprintFromImage } from "../../../../src/photos/makeVisualFingerprintFromImage.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { createTestConfig } from "../../../helpers/createTestConfig.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { createPublicationFixture } from "./publicationTestHelpers.ts";

function _makeHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function _makePhotoEvidence() {
  const circles = Array.from({ length: 25 }, (_, index) => {
    return `<circle cx="${(index * 71) % 380}" cy="${(index * 43) % 280}" r="${12 + index}" fill="rgb(${index * 9},${230 - index * 6},${index * 5})"/>`;
  }).join("");
  const original = await sharp(
    Buffer.from(
      `<svg width="400" height="300"><rect width="400" height="300" fill="#742339"/>${circles}</svg>`,
    ),
  )
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const exported = await sharp(original)
    .autoOrient()
    .resize(150)
    .jpeg({ quality: 75 })
    .toBuffer();
  const originalFingerprint = await makeVisualFingerprintFromImage(original);
  const exportedFingerprint = await makeVisualFingerprintFromImage(exported);
  expect(originalFingerprint).toEqual(expect.any(String));
  expect(exportedFingerprint).toEqual(expect.any(String));
  expect(_makeHash(exported)).not.toBe(_makeHash(original));
  expect(exportedFingerprint).not.toBe(originalFingerprint);
  return {
    original,
    exported,
    originalFingerprint: originalFingerprint!,
    exportedFingerprint: exportedFingerprint!,
  };
}

function _makeEntries(
  evidence: Awaited<ReturnType<typeof _makePhotoEvidence>>,
): ManifestEntry[] {
  return [
    {
      clientRef: "exact-original",
      pickId: "exact-original",
      originalFilename: "original.jpg",
      declaredContentType: "image/jpeg",
      declaredBytes: evidence.original.length,
      contentHash: _makeHash(evidence.original),
      width: 300,
      height: 400,
      capturedAt: "2026-10-14T10:00:00Z",
    },
    {
      clientRef: "resized-export",
      pickId: "resized-export",
      originalFilename: "renamed-export.jpg",
      declaredContentType: "image/jpeg",
      declaredBytes: evidence.exported.length,
      contentHash: _makeHash(evidence.exported),
      visualFingerprint: evidence.exportedFingerprint,
      width: 150,
      height: 200,
      capturedAt: "2026-10-14T10:00:00Z",
    },
  ];
}

async function _makeUploadAccess(
  fixture: Awaited<ReturnType<typeof createPublicationFixture>>,
) {
  const member = await insertSignedInMember({
    database: fixture.database,
    session: { expires_at: "2027-01-01T00:00:00Z" },
  });
  await insertInstanceSetting(fixture.database, {
    key: "shoebox.timezone",
    value: "UTC",
  });
  const sessionId = await insertUploadSession(fixture.database, {
    uploadedBy: member.memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
  });
  return { cookie: member.cookie, sessionId };
}

async function _makeScenario(enabled: boolean) {
  const fixture = await createPublicationFixture();
  const evidence = await _makePhotoEvidence();
  const identity = {
    checksum: _makeHash(evidence.original),
    byte_size: evidence.original.length,
    visual_fingerprint: evidence.originalFingerprint,
    width: 300,
    height: 400,
  };
  await fixture.database
    .updateTable("items")
    .set(identity)
    .where("id", "=", fixture.itemId)
    .execute();
  const testApp = await createTestApp({
    database: fixture.database,
    clock: fixture.clock,
    config: createTestConfig({ MEDIA_PROCESSING_ENABLED: String(enabled) }),
  });
  return {
    ...fixture,
    ...(await _makeUploadAccess(fixture)),
    testApp,
    identity,
    entries: _makeEntries(evidence),
  };
}

async function _expectPreservedIdentity(
  fixture: Awaited<ReturnType<typeof _makeScenario>>,
) {
  expect(
    await fixture.database
      .selectFrom("upload_files")
      .select(["duplicate_reason", "storage_key"])
      .orderBy("position")
      .execute(),
  ).toEqual([
    { duplicate_reason: "archive", storage_key: null },
    { duplicate_reason: "archive", storage_key: null },
  ]);
  expect(
    await fixture.database
      .selectFrom("items")
      .select([
        "checksum",
        "byte_size",
        "visual_fingerprint",
        "width",
        "height",
      ])
      .where("id", "=", fixture.itemId)
      .executeTakeFirstOrThrow(),
  ).toEqual(fixture.identity);
  expect(fixture.testApp.b2.calls).toEqual([]);
}

it.each([false, true])(
  "keeps exact and re-encoded photo duplicates skipped after optimization (processing=%s)",
  async (enabled) => {
    const fixture = await _makeScenario(enabled);
    try {
      expect(await fixture.publish()).toBe(true);
      const response = await fixture.testApp.app.inject({
        method: "PATCH",
        url: `/api/upload-sessions/${fixture.sessionId}/manifest`,
        headers: { cookie: fixture.cookie },
        payload: { files: fixture.entries },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        totalBytes: 0,
        outcomes: [{ state: "cancelled" }, { state: "cancelled" }],
      });
      await _expectPreservedIdentity(fixture);
    } finally {
      await fixture.testApp.app.close();
    }
  },
);
