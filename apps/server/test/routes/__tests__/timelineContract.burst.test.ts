import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "../../../src/db/types/db.types.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertRendition,
  insertUploadSession,
  insertVisibilityRule,
  setBurstCover,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

describe("a burst in the pile", () => {
  const seedBurst = async (
    database: Kysely<Database>,
    options: { memberId: string; hiddenRuleId?: string },
  ) => {
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: options.memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [0, 1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: options.memberId,
          seq: index + 1,
          captured_on: "2026-09-14",
          captured_at: shiftMinutes({
            instant: "2026-09-14T06:41:00.000Z",
            minutes: index,
          }),
          burst_id: burstId,
          burst_index: index + 1,
          ...(index === 2 && options.hiddenRuleId !== undefined
            ? { visibility_rule_id: options.hiddenRuleId }
            : {}),
        });
        await insertRendition(database, { itemId, purpose: "thumb" });
        return itemId;
      }),
    );
    return { burstId, frameIds };
  };

  it("draws one stack whose count and span cover the visible frames only", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const { burstId, frameIds } = await seedBurst(database, {
      memberId: otherMemberId,
      hiddenRuleId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    // Two visible frames of three, so the day counts two and draws one print.
    expect(day.itemCount).toBe(2);
    expect(day.items).toHaveLength(1);
    expect(day.items[0].burst).toEqual({
      burstId,
      visibleFrameCount: 2,
      startsAt: "2026-09-14T06:41:00.000Z",
      endsAt: "2026-09-14T06:42:00.000Z",
      coverItemId: frameIds[0],
      hasUnseenFrames: true,
    });
    expect(response.body).not.toContain(frameIds[2]);
    await close();
  });

  it("falls back to the earliest visible frame when the cover is restricted", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const { burstId, frameIds } = await seedBurst(database, {
      memberId: otherMemberId,
      hiddenRuleId,
    });
    await setBurstCover(database, {
      burstId,
      coverItemId: frameIds[2] ?? "",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].burst.coverItemId).toBe(
      frameIds[0],
    );
    await close();
  });

  it("draws a burst of one visible frame as a plain print", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      captured_on: "2026-09-14",
      burst_id: burstId,
      burst_index: 1,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].burst).toBeNull();
    await close();
  });

  it("makes a burst with no visible frames vanish from the day entirely", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    await Promise.all(
      [0, 1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: otherMemberId,
          seq: index + 1,
          captured_on: "2026-09-14",
          burst_id: burstId,
          burst_index: index + 1,
          visibility_rule_id: hiddenRuleId,
        });
        await insertRendition(database, { itemId, purpose: "thumb" });
      }),
    );
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 10 });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    const [day] = response.json().days;
    expect(day.itemCount).toBe(1);
    expect(day.items).toHaveLength(1);
    expect(response.body).not.toContain(burstId);
    await close();
  });
});
