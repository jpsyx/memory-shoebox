import { describe, expect, it } from "vitest";
import { itemDetailSchema } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertRendition,
  insertUploadSession,
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

describe("GET /api/items/:itemId", () => {
  it("serves a payload the contract's own schema accepts", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "GET",
      url: `/api/items/${itemId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(() => {
      return itemDetailSchema.parse(response.json());
    }).not.toThrow();
    await close();
  });

  it("counts the open, and reports the state the viewer arrived in", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const url = `/api/items/${itemId}`;

    const first = await app.inject({ method: "GET", url, headers: { cookie } });
    const second = await app.inject({
      method: "GET",
      url,
      headers: { cookie },
    });

    expect(first.json().isUnseen).toBe(true);
    expect(second.json().isUnseen).toBe(false);

    const row = await database
      .selectFrom("item_views")
      .selectAll()
      .where("item_id", "=", itemId)
      .where("member_id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.open_count).toBe(2);
    await close();
  });

  it("latches a sighting for the siblings in the strip, and no open", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_on: "2026-09-14",
        });
        await insertRendition(database, { itemId });
        return itemId;
      }),
    );

    await app.inject({
      method: "GET",
      url: `/api/items/${frameIds[0]}`,
      headers: { cookie },
    });

    const rows = await database
      .selectFrom("item_views")
      .selectAll()
      .where("member_id", "=", memberId)
      .execute();

    expect(rows).toHaveLength(3);
    const sibling = rows.find((row) => {
      return row.item_id === frameIds[1];
    });
    expect(sibling?.first_seen_at).toBe(NOW);
    expect(sibling?.first_opened_at).toBeNull();
    expect(sibling?.open_count).toBe(0);

    // The opened item is itself a member of its own burst strip: the seen
    // latch's `INSERT ... ON CONFLICT DO NOTHING` must leave its row, already
    // written by the open latch moments earlier in the same request, alone.
    const opened = rows.find((row) => {
      return row.item_id === frameIds[0];
    });
    expect(opened?.first_opened_at).toBe(NOW);
    expect(opened?.open_count).toBe(1);
    await close();
  });

  it("counts a second open of a burst frame without re-latching its siblings", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_on: "2026-09-14",
        });
        await insertRendition(database, { itemId });
        return itemId;
      }),
    );
    const url = `/api/items/${frameIds[0]}`;

    await app.inject({ method: "GET", url, headers: { cookie } });
    await app.inject({ method: "GET", url, headers: { cookie } });

    const rows = await database
      .selectFrom("item_views")
      .selectAll()
      .where("member_id", "=", memberId)
      .execute();

    expect(rows).toHaveLength(3);
    const opened = rows.find((row) => {
      return row.item_id === frameIds[0];
    });
    expect(opened?.open_count).toBe(2);
    expect(opened?.first_opened_at).toBe(NOW);

    const sibling = rows.find((row) => {
      return row.item_id === frameIds[1];
    });
    expect(sibling?.open_count).toBe(0);
    expect(sibling?.first_opened_at).toBeNull();
    await close();
  });

  it("answers an invisible item exactly as it answers an id that never existed", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertRendition(database, { itemId: hiddenId });

    const hidden = await app.inject({
      method: "GET",
      url: `/api/items/${hiddenId}`,
      headers: { cookie },
    });
    const nothing = await app.inject({
      method: "GET",
      url: `/api/items/${createId()}`,
      headers: { cookie },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    expect(hidden.json().error).toBe("item_not_found");

    // A 404 writes nothing: the open count is not a probe either.
    expect(
      await database.selectFrom("item_views").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("refuses an anonymous caller", async () => {
    const { app, database, close } = await makeApp();
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "GET",
      url: `/api/items/${itemId}`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });
});
