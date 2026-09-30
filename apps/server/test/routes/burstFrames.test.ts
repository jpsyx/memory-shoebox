import { describe, expect, it } from "vitest";
import { burstFramesResponseSchema } from "@memory-shoebox/shared";
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

describe("GET /api/bursts/:burstId/frames", () => {
  it("fans the burst into the frames this viewer may see", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    await Promise.all(
      [1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_on: "2026-09-14",
        });
        await insertRendition(database, { itemId });
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/bursts/${burstId}/frames`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = burstFramesResponseSchema.parse(response.json());
    expect(
      body.frames.map((frame) => {
        return frame.position;
      }),
    ).toEqual([1, 2]);
    expect(body.nextCursor).toBeNull();
    await close();
  });

  it("latches a sighting for the frames it returns", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      burst_id: burstId,
      burst_index: 1,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });

    await app.inject({
      method: "GET",
      url: `/api/bursts/${burstId}/frames`,
      headers: { cookie },
    });

    const row = await database
      .selectFrom("item_views")
      .selectAll()
      .where("item_id", "=", itemId)
      .executeTakeFirstOrThrow();
    expect(row.first_seen_at).toBe(NOW);
    expect(row.first_opened_at).toBeNull();
    await close();
  });

  it("pages a burst too long for one request, numbering straight through", async () => {
    // The cursor was parsed and ignored, and `nextCursor` was null whatever
    // the limit, so a burst longer than one page was truncated and the client
    // was told that was all of it.
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds: string[] = [];
    for (const index of [1, 2, 3]) {
      const itemId = await insertItem(database, {
        uploadedBy: memberId,
        seq: index,
        burst_id: burstId,
        burst_index: index,
        captured_on: "2026-09-14",
      });
      await insertRendition(database, { itemId });
      frameIds.push(itemId);
    }

    const firstResponse = await app.inject({
      method: "GET",
      url: `/api/bursts/${burstId}/frames?limit=2`,
      headers: { cookie },
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPage = burstFramesResponseSchema.parse(firstResponse.json());
    expect(
      firstPage.frames.map((frame) => {
        return [frame.itemId, frame.position];
      }),
    ).toEqual([
      [frameIds[0], 1],
      [frameIds[1], 2],
    ]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondResponse = await app.inject({
      method: "GET",
      url: `/api/bursts/${burstId}/frames?limit=2&cursor=${encodeURIComponent(
        firstPage.nextCursor ?? "",
      )}`,
      headers: { cookie },
    });
    expect(secondResponse.statusCode).toBe(200);
    const secondPage = burstFramesResponseSchema.parse(secondResponse.json());
    // Dense **and** continuous: a position that restarted at 1 here would
    // tell the viewer there are two frame 1s in one burst.
    expect(
      secondPage.frames.map((frame) => {
        return [frame.itemId, frame.position];
      }),
    ).toEqual([[frameIds[2], 3]]);
    expect(secondPage.nextCursor).toBeNull();
    await close();
  });

  it("refuses a cursor it did not issue", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    await Promise.all(
      [1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_on: "2026-09-14",
        });
        await insertRendition(database, { itemId });
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/bursts/${burstId}/frames?cursor=not-a-cursor`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors.cursor).toHaveLength(1);
    await close();
  });

  it("is a 404, not an empty list, when the viewer can see no frame", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      burst_id: burstId,
      burst_index: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertRendition(database, { itemId });

    const restricted = await app.inject({
      method: "GET",
      url: `/api/bursts/${burstId}/frames`,
      headers: { cookie },
    });
    const nothing = await app.inject({
      method: "GET",
      url: `/api/bursts/${createId()}/frames`,
      headers: { cookie },
    });

    expect(restricted.statusCode).toBe(404);
    expect(restricted.json().error).toBe("burst_not_found");
    expect(restricted.body).toBe(nothing.body);
    await close();
  });
});
