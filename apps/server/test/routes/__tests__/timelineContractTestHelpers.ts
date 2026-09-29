import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";
import {
  insertItem,
  insertRendition,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** An app whose clock stands still, on `NOW`. */
export const makeApp = async (
  overrides: { database?: Kysely<Database> } = {},
): Promise<TestApp> => {
  return createTestApp({
    ...overrides,
    clock: () => {
      return new Date(NOW);
    },
  });
};

/** One photograph, drawable, on a day. */
export async function insertDrawableItem(
  database: Kysely<Database>,
  options: {
    uploadedBy: string;
    seq: number;
    capturedOn?: string;
    capturedAt?: string;
    visibilityRuleId?: string;
  },
): Promise<string> {
  const capturedOn = options.capturedOn ?? "2026-09-14";
  const itemId = await insertItem(database, {
    uploadedBy: options.uploadedBy,
    seq: options.seq,
    captured_on: capturedOn,
    captured_at: options.capturedAt ?? `${capturedOn}T09:00:00.000Z`,
    ...(options.visibilityRuleId === undefined
      ? {}
      : { visibility_rule_id: options.visibilityRuleId }),
  });
  await insertRendition(database, { itemId, purpose: "thumb" });
  await insertRendition(database, { itemId, purpose: "display" });
  return itemId;
}
