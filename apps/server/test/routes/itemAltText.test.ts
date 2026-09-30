import { describe, expect, it } from "vitest";
import { itemDetailSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("PATCH /api/items/:itemId", () => {
  it("stores the override and returns the whole item", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      headers: { cookie },
      payload: { altText: "  Mateo blowing out the candle  " },
    });

    expect(response.statusCode).toBe(200);
    const detail = itemDetailSchema.parse(response.json());
    expect(detail.altTextOverride).toBe("Mateo blowing out the candle");
    expect(detail.media.altText).toBe("Mateo blowing out the candle");
    await close();
  });

  it("clears the override and comes back to the generated string", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      alt_text: "Something somebody typed",
      captured_at: "2026-09-14T04:41:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });

    const blank = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      headers: { cookie },
      payload: { altText: "   " },
    });

    expect(blank.json().altTextOverride).toBeNull();
    expect(blank.json().media.altText).toBe("Mateo, 14 September 2026");

    const row = await database
      .selectFrom("items")
      .select("alt_text")
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();
    // Cleared rather than stored blank: the column is written only when
    // somebody types a real description.
    expect(row.alt_text).toBeNull();
    await close();
  });

  it("lets any uploader describe anybody's photograph, and refuses a viewer", async () => {
    const { app, database, close } = await makeApp();
    const uploaderId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertRendition(database, { itemId });
    const { cookie: otherUploaderCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: viewerCookie } = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });

    const byOtherUploader = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      headers: { cookie: otherUploaderCookie },
      payload: {
        altText: "Whoever recognises the face should be able to say so",
      },
    });
    const byViewer = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      headers: { cookie: viewerCookie },
      payload: { altText: "Not mine to write" },
    });

    expect(byOtherUploader.statusCode).toBe(200);
    expect(byViewer.statusCode).toBe(403);
    expect(byViewer.json().error).toBe("item_edit_forbidden");
    await close();
  });

  it("refuses an override over two thousand characters", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      headers: { cookie },
      payload: { altText: "x".repeat(2001) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.altText).toBeDefined();
    await close();
  });

  it("writes no audit row and counts no open", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });

    await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      headers: { cookie },
      payload: { altText: "Alt text is not access and not destruction" },
    });

    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("item_views").selectAll().execute(),
    ).toEqual([]);
    await close();
  });
});
