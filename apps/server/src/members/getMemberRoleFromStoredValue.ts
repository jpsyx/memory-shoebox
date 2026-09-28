import { memberRoleSchema, type MemberRole } from "@memory-shoebox/shared";

/**
 * The role on a `members` row, failing closed.
 *
 * The column carries a `CHECK`, so this is belt and braces. The direction it
 * fails in is the point: the alternative to a narrowing helper is a cast that
 * would let any string through as a role, and the safe answer to a value
 * nobody recognises is the least powerful one.
 */
export function getMemberRoleFromStoredValue(value: string): MemberRole {
  const parsed = memberRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "viewer";
}
