import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/items/:itemId/original", () => {
  it("redirects to a signed URL carrying the original filename", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      original_filename: "IMG_20260914_064132.jpg",
    });
    await insertRendition(database, {
      itemId,
      purpose: "original",
      storage_key: `items/${itemId}/original.jpg`,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/items/${itemId}/original`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("original.jpg");
    expect(response.headers.location).toContain("IMG_20260914_064132.jpg");
    await close();
  });

  it("answers an invisible item and a missing original identically to a bad id", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    const noOriginalId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertRendition(database, { itemId: noOriginalId });

    const responses = await Promise.all(
      [hiddenId, noOriginalId, createId()].map((itemId) => {
        return app.inject({
          method: "GET",
          url: `/api/items/${itemId}/original`,
          headers: { cookie },
        });
      }),
    );

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([404, 404, 404]);
    expect(
      new Set(
        responses.map((response) => {
          return response.body;
        }),
      ).size,
    ).toBe(1);
    await close();
  });
});
