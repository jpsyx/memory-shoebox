import { itemDetailSchema } from "@memory-shoebox/shared";
import { describe, expect, it, onTestFinished } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertRendition,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _makeContext() {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  onTestFinished(context.close);
  const owner = await insertSignedInMember({
    database: context.database,
    member: { role: "uploader" },
  });
  const sessionId = await insertUploadSession(context.database, {
    uploadedBy: owner.memberId,
  });
  const burstId = await insertBurst(context.database, {
    uploadSessionId: sessionId,
    capturedOn: "2026-09-14",
  });
  const itemIds = await Promise.all(
    [1, 2, 3].map(async (position) => {
      const itemId = await insertItem(context.database, {
        uploadedBy: owner.memberId,
        seq: position,
        burst_id: burstId,
        burst_index: position,
        captured_on: "2026-09-14",
      });
      await insertRendition(context.database, { itemId });
      return itemId;
    }),
  );
  const patch = (itemId: string, action: string, cookie = owner.cookie) => {
    return context.app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/burst`,
      headers: { cookie },
      payload: { action },
    });
  };
  return { ...context, owner, itemIds, burstId, patch };
}

describe("item burst controls", () => {
  it("keeps photos and metadata when removing every frame and restores the original group and order", async () => {
    const context = await _makeContext();
    const original = await context.database
      .selectFrom("bursts")
      .selectAll()
      .executeTakeFirstOrThrow();
    for (const itemId of context.itemIds) {
      const response = await context.patch(itemId, "remove");
      expect(response.statusCode).toBe(200);
      expect(itemDetailSchema.parse(response.json())).toMatchObject({
        burst: null,
        canRestoreBurst: true,
        capabilities: { canManageBurst: true },
      });
    }
    expect(
      await context.database.selectFrom("bursts").selectAll().execute(),
    ).toEqual([]);
    expect(
      await context.database
        .selectFrom("item_renditions")
        .selectAll()
        .execute(),
    ).toHaveLength(3);
    expect(
      await context.database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
    for (const itemId of [...context.itemIds].reverse()) {
      expect((await context.patch(itemId, "restore")).statusCode).toBe(200);
    }
    expect(
      await context.database
        .selectFrom("bursts")
        .selectAll()
        .executeTakeFirstOrThrow(),
    ).toEqual(original);
    const items = await context.database
      .selectFrom("items")
      .select(["id", "burst_id", "burst_index"])
      .orderBy("burst_index")
      .execute();
    expect(
      items.map((item) => {
        return [item.id, item.burst_id, item.burst_index];
      }),
    ).toEqual(
      context.itemIds.map((itemId, index) => {
        return [itemId, context.burstId, index + 1];
      }),
    );
  });

  it("permits owners including demoted owners and admins, but denies other visible uploaders", async () => {
    const context = await _makeContext();
    const other = await insertSignedInMember({
      database: context.database,
      token: "other",
      member: { role: "uploader" },
    });
    const admin = await insertSignedInMember({
      database: context.database,
      token: "admin",
      member: { role: "admin" },
    });
    expect(
      (await context.patch(context.itemIds[0]!, "remove", other.cookie))
        .statusCode,
    ).toBe(403);
    expect(
      (await context.patch(context.itemIds[0]!, "remove", admin.cookie))
        .statusCode,
    ).toBe(200);
    await context.database
      .updateTable("members")
      .set({ role: "viewer" })
      .where("id", "=", context.owner.memberId)
      .execute();
    expect(
      (await context.patch(context.itemIds[0]!, "restore")).statusCode,
    ).toBe(200);
  });

  it("makes hidden and missing photos indistinguishable and publishes per-frame permission", async () => {
    const context = await _makeContext();
    const other = await insertSignedInMember({
      database: context.database,
      token: "other",
    });
    const frames = await context.app.inject({
      method: "GET",
      url: `/api/bursts/${context.burstId}/frames`,
      headers: { cookie: other.cookie },
    });
    expect(
      frames.json().frames.every((frame: { canRemoveFromBurst: boolean }) => {
        return frame.canRemoveFromBurst === false;
      }),
    ).toBe(true);
    const ruleId = await insertVisibilityRule(context.database, {
      mode: "only",
    });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: ruleId })
      .where("id", "=", context.itemIds[0]!)
      .execute();
    const hidden = await context.patch(
      context.itemIds[0]!,
      "remove",
      other.cookie,
    );
    const missing = await context.patch(createId(), "remove", other.cookie);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(missing.body);
  });

  it("refuses restoration on another capture day without changing membership", async () => {
    const context = await _makeContext();
    expect(
      (await context.patch(context.itemIds[0]!, "remove")).statusCode,
    ).toBe(200);
    await context.database
      .updateTable("items")
      .set({ captured_on: "2026-09-13" })
      .where("id", "=", context.itemIds[0]!)
      .execute();
    const response = await context.patch(context.itemIds[0]!, "restore");
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("item_burst_date_conflict");
    const detail = await context.app.inject({
      method: "GET",
      url: `/api/items/${context.itemIds[0]}`,
      headers: { cookie: context.owner.cookie },
    });
    expect(detail.json().canRestoreBurst).toBe(false);
  });
  it("rejects a group whose active capture day no longer matches the original", async () => {
    const context = await _makeContext();
    expect(
      (await context.patch(context.itemIds[0]!, "remove")).statusCode,
    ).toBe(200);
    await context.database
      .updateTable("bursts")
      .set({ captured_on: "2026-09-13" })
      .where("id", "=", context.burstId)
      .execute();
    expect(
      (await context.patch(context.itemIds[0]!, "restore")).statusCode,
    ).toBe(409);
    const detail = await context.app.inject({
      method: "GET",
      url: `/api/items/${context.itemIds[0]}`,
      headers: { cookie: context.owner.cookie },
    });
    expect(detail.json().canRestoreBurst).toBe(false);
  });

  it("retains history when a date correction ejects a photo, enabling return after correcting the date back", async () => {
    const context = await _makeContext();
    const changeDate = (capturedOn: string) => {
      return context.app.inject({
        method: "POST",
        url: `/api/items/${context.itemIds[0]}/capture-date`,
        headers: { cookie: context.owner.cookie },
        payload: { capturedOn },
      });
    };
    expect((await changeDate("2026-09-13")).statusCode).toBe(200);
    const corrected = await changeDate("2026-09-14");
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().canRestoreBurst).toBe(true);
    expect(
      (await context.patch(context.itemIds[0]!, "restore")).statusCode,
    ).toBe(200);
  });
  it("keeps a video in a mixed burst while advertising no photo grouping capability", async () => {
    const context = await _makeContext();
    await context.database
      .updateTable("items")
      .set({ kind: "video", duration_ms: 1000 })
      .where("id", "=", context.itemIds[0]!)
      .execute();
    const detail = await context.app.inject({
      method: "GET",
      url: `/api/items/${context.itemIds[0]}`,
      headers: { cookie: context.owner.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().capabilities.canManageBurst).toBe(false);
    expect(detail.json().burst.visibleFrameCount).toBe(3);
    expect(
      (await context.patch(context.itemIds[0]!, "remove")).statusCode,
    ).toBe(409);
  });
});
