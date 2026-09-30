import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertInstanceSetting,
  insertItem,
  insertItemMilestone,
  insertMember,
  insertMilestone,
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

/** 06:41 local at +02:00, on a day two bursts and a milestone agree on. */
const CAPTURED = {
  captured_at: "2026-09-14T04:41:32.000Z",
  captured_at_offset_minutes: 120,
  captured_on: "2026-09-14",
  capture_source: "exif",
  original_captured_at: "2026-09-14T04:41:32.000Z",
} as const;

describe("POST /api/items/:itemId/capture-date", () => {
  it("answers with the item's new burst and its re-armed milestones", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
      burst_id: burstId,
      burst_index: 0,
      seq: 1,
    });
    const siblingId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
      burst_id: burstId,
      burst_index: 1,
      seq: 2,
    });
    await insertRendition(database, { itemId });
    await insertRendition(database, { itemId: siblingId });
    const milestoneId = await insertMilestone(database, {
      name: "The christening",
      startsOn: "2026-09-13",
      endsOn: "2026-09-15",
    });
    await insertItemMilestone(database, {
      itemId,
      milestoneId,
      span_mismatch_acknowledged_at: NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/capture-date`,
      headers: { cookie },
      payload: { capturedOn: "2026-09-20" },
    });

    expect(response.statusCode).toBe(200);
    const detail = response.json();
    expect(detail.capturedAt).toBe("2026-09-20T04:41:32.000Z");
    expect(detail.capturedOn).toBe("2026-09-20");
    expect(detail.captureSource).toBe("uploader_set");
    // The item has just been ejected, so there is no burst to describe.
    expect(detail.burst).toBeNull();
    expect(detail.burstFrames).toEqual([]);
    expect(detail.milestones).toEqual([
      expect.objectContaining({
        milestoneId,
        spanContainsCapturedOn: false,
        mismatchAcknowledgedAt: null,
      }),
    ]);
    await close();
  });

  it("belongs to the item's own uploader, not to any uploader", async () => {
    const { app, database, close } = await makeApp();
    const uploaderId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      ...CAPTURED,
    });
    await insertRendition(database, { itemId });
    const { cookie: otherUploaderCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });

    const byOther = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/capture-date`,
      headers: { cookie: otherUploaderCookie },
      payload: { capturedOn: "2026-09-20" },
    });
    const byAdmin = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/capture-date`,
      headers: { cookie: adminCookie },
      payload: { capturedOn: "2026-09-20" },
    });

    expect(byOther.statusCode).toBe(403);
    expect(byOther.json().error).toBe("item_capture_date_forbidden");
    expect(byAdmin.statusCode).toBe(200);
    await close();
  });

  it("refuses a day that has not happened yet in the Shoebox zone", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/capture-date`,
      headers: { cookie },
      // The clock stands at 2026-09-27T10:00Z and the zone defaults to UTC.
      payload: { capturedOn: "2026-09-28" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.capturedOn).toBeDefined();
    // A refused request writes nothing.
    expect(
      await database
        .selectFrom("item_capture_date_changes")
        .selectAll()
        .execute(),
    ).toEqual([]);
    await close();
  });

  it("takes today from the Shoebox zone rather than from UTC", async () => {
    const { app, database, close } = await makeApp();
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      // Fourteen hours ahead, where 2026-09-27T10:00Z is already the 28th.
      value: "Pacific/Kiritimati",
    });
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/capture-date`,
      headers: { cookie },
      payload: { capturedOn: "2026-09-28" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().capturedOn).toBe("2026-09-28");
    await close();
  });

  it("is a 404 on an invisible item, byte-identical to a bad id", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      ...CAPTURED,
      visibility_rule_id: hiddenRuleId,
    });

    const hidden = await app.inject({
      method: "POST",
      url: `/api/items/${hiddenId}/capture-date`,
      headers: { cookie },
      payload: { capturedOn: "2026-09-20" },
    });
    const nothing = await app.inject({
      method: "POST",
      url: `/api/items/${createId()}/capture-date`,
      headers: { cookie },
      payload: { capturedOn: "2026-09-20" },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    await close();
  });
});
