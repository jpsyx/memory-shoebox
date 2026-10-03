import { ApiError } from "../../../../src/http/ApiError.ts";
import type { UploadFileRow } from "../../../../src/upload/uploadSessionAccessHelpers.ts";

import { type CompletedTransfer } from "../../../../src/upload/verifyUploadedObjects/verifyUploadedObjects.types.ts";

import { NOW } from "../../../helpers/seedHelpers/seedHelpers.ts";

/**
 * Deterministic SHA-256 checksum used by the fixtures.
 */
export const HASH = "a".repeat(64);

/**
 * Storage key for the fixture original.
 */
export const ORIGINAL_KEY = "uploads/session/file/original.jpg";

/**
 * Storage key for the fixture thumbnail.
 */
export const THUMB_KEY = "uploads/session/file/thumb.jpg";

/**
 * Returns an upload-file fixture with the supplied row overrides.
 */
export function makeFile(
  overrides: Partial<UploadFileRow> = {},
): UploadFileRow {
  return {
    id: "file",
    upload_session_id: "session",
    item_id: null,
    position: 1,
    original_filename: "IMG_0001.jpg",
    declared_content_type: "image/jpeg",
    declared_bytes: 1024,
    content_hash: HASH,
    kind: "photo",
    storage_key: ORIGINAL_KEY,
    state: "sending",
    attempt_count: 1,
    presigned_until: NOW,
    multipart_upload_id: null,
    problem_code: null,
    problem_detail: null,
    captured_at: NOW,
    capture_date: "2026-09-27",
    capture_offset_minutes: null,
    capture_source: "upload_time",
    original_captured_at: NOW,
    width: 4032,
    height: 3024,
    duration_ms: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/**
 * Returns a completed-transfer fixture with the supplied overrides.
 */
export function makeTransfer(
  overrides: Partial<CompletedTransfer> = {},
): CompletedTransfer {
  return {
    contentHash: HASH,
    byteSize: 1024,
    parts: undefined,
    width: 4032,
    height: 3024,
    durationMs: undefined,
    renditions: [],
    ...overrides,
  };
}

/**
 * Returns the ApiError thrown by the callback; fails if it does not refuse.
 */
export function getRefusal(run: () => unknown): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a refusal");
}
