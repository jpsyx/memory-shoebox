import type { LightMyRequestResponse } from "fastify";
import { createHash } from "node:crypto";
import type { Kysely, Selectable } from "kysely";

import { type ManifestEntry } from "@memory-shoebox/shared";

import type { Database } from "../../../../src/db/types/db.types.ts";

import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** One independently created upload test fixture. */
type FixtureContext = Awaited<ReturnType<typeof createTestApp>> & {
  cookie: string;
  memberId: string;
  sessionId: string;
  patchManifest: (
    files: readonly ManifestEntry[],
  ) => Promise<LightMyRequestResponse>;
};

/**
 * Shoebox timezone used to interpret the manifest fixtures.
 */
export const TIMEZONE = "Europe/Madrid";

/**
 * EXIF capture evidence supplied by the manifest fixtures.
 */
export const EXIF_EVIDENCE = {
  exifCapturedAtLocal: "2026-09-14T06:41:32",
  exifOffsetMinutes: 120,
};

/**
 * Timestamp used for the capture-date amendment fixtures.
 */
export const AMENDED_AT = "2026-09-16T04:41:32.000Z";

/**
 * Returns the SHA-256 checksum of the fixture seed.
 */
export function makeHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Returns a manifest entry with the supplied fixture overrides.
 */
export function makeEntry(
  options: { clientRef: string } & Partial<ManifestEntry>,
): ManifestEntry {
  return {
    originalFilename: `IMG_${options.clientRef}.jpg`,
    declaredContentType: "image/jpeg",
    declaredBytes: 2_400_000,
    capture: EXIF_EVIDENCE,
    ...options,
  };
}

/**
 * Returns the session files in manifest order.
 */
export async function readFiles(
  functionOptions: Readonly<{ database: Kysely<Database>; sessionId: string }>,
): Promise<Array<Selectable<Database["upload_files"]>>> {
  const { database, sessionId } = functionOptions;

  return database
    .selectFrom("upload_files")
    .selectAll()
    .where("upload_session_id", "=", sessionId)
    .orderBy("position", "asc")
    .execute();
}

/**
 * Creates an upload-route fixture and returns its catalog and request
 * helpers.
 */
export async function setUpUploadTestContext(
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
): Promise<FixtureContext> {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "shoebox.timezone",
    value: TIMEZONE,
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -30 }),
    ...sessionOverrides,
  });
  const patchManifest = (files: readonly ManifestEntry[]) => {
    return testApp.app.inject({
      method: "PATCH",
      url: `/api/upload-sessions/${sessionId}/manifest`,
      headers: { cookie },
      payload: { files },
    });
  };
  return { ...testApp, cookie, memberId, sessionId, patchManifest };
}
