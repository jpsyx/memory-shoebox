/**
 * The shape every capture-date test starts from: 06:41 local, at +02:00.
 *
 * One fixture rather than one per file, so that "the day it moves to" is the
 * only thing that differs between them.
 */
export const CAPTURED = {
  captured_at: "2026-09-14T04:41:32.000Z",
  captured_at_offset_minutes: 120,
  captured_on: "2026-09-14",
  capture_source: "exif",
  original_captured_at: "2026-09-14T04:41:32.000Z",
} as const;
