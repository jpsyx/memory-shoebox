import { describe, expect, it } from "vitest";
import { timelineRailResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertTag,
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

describe("GET /api/timeline/rail", () => {
  it("counts visible photos and videos separately for each day", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
      kind: "video",
    });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 3,
      captured_on: "2026-09-14",
      visibility_rule_id: hiddenRuleId,
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 4,
      captured_on: "2026-09-11",
    });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 5,
      captured_on: "2026-09-14",
      kind: "video",
      visibility_rule_id: hiddenRuleId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(timelineRailResponseSchema.parse(response.json())).toEqual({
      days: [
        {
          capturedOn: "2026-09-14",
          itemCount: 2,
          photoCount: 1,
          videoCount: 1,
        },
        {
          capturedOn: "2026-09-11",
          itemCount: 1,
          photoCount: 1,
          videoCount: 0,
        },
      ],
      nextCursor: null,
    });
    await close();
  });

  it("carries a milestone-only day at zero, which is the point", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });
    expect(response.json().days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 1, photoCount: 1, videoCount: 0 },
      { capturedOn: "2026-09-13", itemCount: 0, photoCount: 0, videoCount: 0 },
    ]);
    await close();
  });

  it("counts only matching media under the same content filter", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const tagId = await insertTag(database, { name: "beach" });
    const taggedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
    });
    const taggedVideoId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
      captured_on: "2026-09-14",
      kind: "video",
    });
    await insertItemTag(database, { itemId: taggedVideoId, tagId });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 4,
      captured_on: "2026-09-14",
      kind: "video",
    });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/timeline/rail?tags=${tagId}`,
      headers: { cookie },
    });
    expect(response.json().days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 2, photoCount: 1, videoCount: 1 },
    ]);
    await close();
  });

  it("counts each visible burst frame as a photo", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    await Promise.all(
      [1, 2, 3].map((frameIndex) => {
        return insertItem(database, {
          uploadedBy: memberId,
          seq: frameIndex,
          captured_on: "2026-09-14",
          burst_id: burstId,
          burst_index: frameIndex,
        });
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });
    expect(response.json().days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 3, photoCount: 3, videoCount: 0 },
    ]);
    await close();
  });

  it("is empty in a way that cannot tell the two empty states apart", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });
    expect(response.body).toBe('{"days":[],"nextCursor":null}');
    await close();
  });

  it("rejects limit and cursor rather than ignoring them", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const limited = await app.inject({
      method: "GET",
      url: "/api/timeline/rail?limit=10",
      headers: { cookie },
    });
    expect(limited.statusCode).toBe(400);
    expect(limited.json().details.fieldErrors.limit).toBeDefined();

    const cursored = await app.inject({
      method: "GET",
      url: "/api/timeline/rail?cursor=abc",
      headers: { cookie },
    });
    expect(cursored.statusCode).toBe(400);
    expect(cursored.json().details.fieldErrors.cursor).toBeDefined();
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
