import { z } from "zod";
import { LIMITS } from "../limits.ts";

function _makeAccountDisplayNameFromName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** A chosen account name, normalized for display without changing its case. */
export const accountNameSchema = z
  .string()
  .regex(
    /^[^@\r\n\v\f\u0085\u2028\u2029\p{Cf}]*$/u,
    "Use your name without @ or line breaks.",
  )
  .transform(_makeAccountDisplayNameFromName)
  .pipe(z.string().min(1).max(LIMITS.memberDisplayNameMaxLength));

/** A validated account name with normalized display spelling. */
export type AccountName = z.infer<typeof accountNameSchema>;

/**
 * Derive a locale-independent comparison key while keeping accents
 * meaningful.
 */
export function makeAccountNameKeyFromName(name: string): string {
  return _makeAccountDisplayNameFromName(name).toLowerCase();
}
