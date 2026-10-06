import { appConfig } from "../../../../app.config.ts";

/**
 * Delay before the first upload tombstone recheck: one URL start lifetime
 * plus the browser's maximum PUT duration. Other clients and suspended tabs
 * can finish later, so this is a settling period rather than a final bound.
 */
export const UPLOAD_OBJECT_SETTLING_WINDOW_MS =
  appConfig.upload.presignTtlSeconds * 2 * 1000;

/** Successful upload tombstones keep checking for late objects once a day. */
export const UPLOAD_OBJECT_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
