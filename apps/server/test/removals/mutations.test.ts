import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertRemovalRequest,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("removal database invariants", () => {
  it.each([
    { state: "open", resolved_at: NOW },
    { state: "deleted", resolved_at: null },
    { state: "declined", decline_reason: null },
    { state: "open", item_id: null, resolved_at: null },
  ])("rejects inconsistent state $state", async (invalid) => {
    const { database, close } = await createTestApp();
    try {
      const memberId = await insertMember(database);
      const itemId = await insertItem(database, { uploadedBy: memberId });
      await expect(
        insertRemovalRequest(database, {
          requestedByMemberId: memberId,
          itemUploaderMemberId: memberId,
          item_id: itemId,
          ...invalid,
        }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });
});
