import { uuidv7 } from "uuidv7";

/**
 * Mints a primary key.
 *
 * UUIDv7 rather than v4, and the difference is load-bearing rather than
 * cosmetic: the first 48 bits are a Unix millisecond timestamp, so ids sort by
 * creation time, inserts land at the end of the index instead of scattering
 * across it, and a cursor needs no second column to break ties. The timeline,
 * the activity feed and the upload file list all page on that property.
 *
 * The library is here for the sub-millisecond counter. Several thousand rows
 * can be written inside one millisecond during an upload commit, and without a
 * counter their order would be random within that millisecond, which is a
 * cursor that silently skips rows.
 */
export function createId(): string {
  return uuidv7();
}
