import { describe, expect, it } from "vitest";
import {
  BATCH_EXPECTED,
  VIEWER_KINDS,
  makeMatrixFixture,
} from "./itemPermissionsMatrixTestHelpers.ts";

describe("who may repoint a selection", () => {
  VIEWER_KINDS.forEach((kind) => {
    it(`POST /api/items/visibility answers ${BATCH_EXPECTED[kind]} for a ${kind}`, async () => {
      const { app, actors, itemId, close } = await makeMatrixFixture();

      const response = await app.inject({
        method: "POST",
        url: "/api/items/visibility",
        headers: { cookie: actors[kind] },
        payload: {
          itemIds: [itemId],
          visibilityRuleId: "visibility-rule-everyone",
        },
      });

      expect(response.statusCode).toBe(BATCH_EXPECTED[kind]);
      if (kind === "otherUploader") {
        // Skipped rather than applied: the 200 must not mean it went
        // through. `itemsVisibility.test.ts` holds the write side of this.
        expect(response.json().skippedCount).toBe(1);
      }
      await close();
    });
  });
});
