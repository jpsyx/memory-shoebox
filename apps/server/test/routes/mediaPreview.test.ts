import { afterEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { CompiledQuery, sql } from "kysely";
import { readMediaNeighbors } from "../../src/media/readMediaNeighbors.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertMember,
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    cleanups.splice(0).map((close) => {
      return close();
    }),
  );
});

async function _context() {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  cleanups.push(context.close);
  const member = await insertSignedInMember({ database: context.database });
  const post = (path: string, payload: unknown) => {
    return context.app.inject({
      method: "POST",
      url: `/api/media/${path}`,
      headers: { cookie: member.cookie },
      payload: payload as object,
    });
  };
  const uploaderId = await insertMember(context.database, { role: "uploader" });
  return { ...context, ...member, uploaderId, post };
}

async function _snapshot(database: Kysely<Database>) {
  return Promise.all(
    ["item_views", "activity_events", "outbound_emails"].map((table) => {
      return sql`select * from ${sql.table(table)} order by id`
        .execute(database)
        .then((result) => {
          return result.rows;
        });
    }),
  );
}

async function _burst(context: Awaited<ReturnType<typeof _context>>) {
  const session = await insertUploadSession(context.database, {
    uploadedBy: context.uploaderId,
  });
  const burstId = await insertBurst(context.database, {
    uploadSessionId: session,
    capturedOn: "2026-09-27",
  });
  // Capture order deliberately differs from burst index and cover order.
  const indices = [3, 1, 2, null];
  const frameIds = await Promise.all(
    indices.map((burst_index, index) => {
      return insertItem(context.database, {
        uploadedBy: context.uploaderId,
        burst_id: burstId,
        burst_index,
        captured_at: `2026-09-27T12:0${index}:00.000Z`,
        seq: index + 10,
      });
    }),
  );
  await context.database
    .updateTable("bursts")
    .set({ cover_item_id: frameIds[2]! })
    .where("id", "=", burstId)
    .execute();
  const before = await insertItem(context.database, {
    uploadedBy: context.uploaderId,
    captured_at: "2026-09-27T11:00:00.000Z",
    seq: 1,
  });
  const after = await insertItem(context.database, {
    uploadedBy: context.uploaderId,
    captured_at: "2026-09-27T13:00:00.000Z",
    seq: 20,
  });
  return { frameIds, burstId, before, after };
}

const SELECTION = { tags: [], people: [] };
function _ids(body: {
  ahead: Array<{ itemId: string }>;
  behind: Array<{ itemId: string }>;
}) {
  expect(body).toHaveProperty("ahead");
  return {
    ahead: body.ahead.map((item) => {
      return item.itemId;
    }),
    behind: body.behind.map((item) => {
      return item.itemId;
    }),
  };
}

describe("side-effect-free media reads", () => {
  it("previews do not mark items or bursts opened", async () => {
    const context = await _context();
    const { before: itemId, frameIds } = await _burst(context);
    await insertRendition(context.database, { itemId });
    const before = await _snapshot(context.database);
    const preview = await context.post("preview", {
      itemIds: [itemId, ...frameIds],
      purpose: "speculative-preview",
    });
    const neighbors = await context.post("neighbors", {
      itemId,
      selection: SELECTION,
      direction: "next",
    });
    expect(preview.statusCode).toBe(200);
    expect(neighbors.statusCode).toBe(200);
    expect(preview.headers["cache-control"]).toBe("no-store");
    expect(neighbors.headers["cache-control"]).toBe("no-store");
    expect(preview.json().items).toHaveLength(5);
    expect(Object.keys(preview.json().items[0]).sort()).toEqual([
      "height",
      "itemId",
      "kind",
      "media",
      "width",
    ]);
    const after = await _snapshot(context.database);
    expect(after).toEqual(before);
  });

  it("omits hidden and missing IDs identically and deduplicates visible IDs", async () => {
    const context = await _context();
    const rule = await insertVisibilityRule(context.database, { mode: "only" });
    const hidden = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      visibility_rule_id: rule,
    });
    const visible = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 1,
    });
    const hiddenResponse = await context.post("preview", {
      itemIds: [hidden],
      purpose: "selected-view",
    });
    const missingResponse = await context.post("preview", {
      itemIds: [createId()],
      purpose: "selected-view",
    });
    expect(hiddenResponse.statusCode).toBe(200);
    expect(hiddenResponse.json()).toEqual(missingResponse.json());
    expect(
      (
        await context.post("preview", {
          itemIds: [visible, visible, hidden],
          purpose: "speculative-preview",
        })
      )
        .json()
        .items.map((item: { itemId: string }) => {
          return item.itemId;
        }),
    ).toEqual([visible]);
    expect(
      (
        await context.post("neighbors", {
          itemId: hidden,
          selection: SELECTION,
          direction: "next",
        })
      ).json(),
    ).toEqual({ ahead: [], behind: [] });
  });

  it("rejects malformed IDs and nine-entry batches without catalog work", async () => {
    const context = await _context();
    const itemId = createId();
    let catalogQueries = 0;
    context.app.database = context.database.withPlugin({
      transformQuery: (args) => {
        catalogQueries += 1;
        return args.node;
      },
      transformResult: async (args) => {
        return args.result;
      },
    });
    for (const itemIds of [
      ["invalid"],
      Array.from({ length: 9 }, () => {
        return itemId;
      }),
      [],
    ]) {
      expect(
        (
          await context.post("preview", {
            itemIds,
            purpose: "speculative-preview",
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await context.post("neighbors", {
          itemId: "invalid",
          direction: "next",
          selection: SELECTION,
        })
      ).statusCode,
    ).toBe(400);
    expect(context.b2.calls).toEqual([]);
    expect(catalogQueries).toBe(0);
  });

  it("enters exact burst edges and keeps null indices last, independent of capture order", async () => {
    const context = await _context();
    const { before, after, frameIds } = await _burst(context);
    const neighbors = async (itemId: string, direction = "next") => {
      return _ids(
        (
          await context.post("neighbors", {
            itemId,
            direction,
            selection: SELECTION,
          })
        ).json(),
      );
    };
    expect(await neighbors(before)).toEqual({
      ahead: [frameIds[1], frameIds[2]],
      behind: [],
    });
    expect(await neighbors(after, "previous")).toEqual({
      ahead: [frameIds[3], frameIds[0]],
      behind: [],
    });
    expect(await neighbors(frameIds[0]!)).toEqual({
      ahead: [frameIds[3], after],
      behind: [frameIds[2]],
    });
    expect(await neighbors(frameIds[1]!, "previous")).toEqual({
      ahead: [before],
      behind: [frameIds[2]],
    });
  });

  it("uses visible burst anchors, partial visibility and every selection filter", async () => {
    const context = await _context();
    const { before, after, frameIds } = await _burst(context);
    const rule = await insertVisibilityRule(context.database, { mode: "only" });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: rule })
      .where("id", "=", frameIds[1]!)
      .execute();
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: before,
            direction: "next",
            selection: SELECTION,
          })
        ).json(),
      ).ahead,
    ).toEqual([frameIds[2], frameIds[0]]);
    const tagId = await insertTag(context.database, { name: "tag" });
    const personId = await insertPerson(context.database, {
      displayName: "person",
    });
    const milestoneId = await insertMilestone(context.database, {
      name: "occasion",
      startsOn: "2026-09-27",
    });
    await Promise.all(
      [before, frameIds[3]!, after].map(async (itemId) => {
        await insertItemTag(context.database, { itemId, tagId });
        await insertItemPerson(context.database, { itemId, personId });
        await insertItemMilestone(context.database, { itemId, milestoneId });
      }),
    );
    const selection = {
      tags: [tagId],
      people: [personId],
      from: "2026-09-27",
      until: "2026-09-27",
      attachedToMilestoneId: milestoneId,
    };
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: before,
            direction: "next",
            selection,
          })
        ).json(),
      ),
    ).toEqual({ ahead: [frameIds[3], after], behind: [] });
    expect(
      (
        await context.post("neighbors", {
          itemId: before,
          direction: "next",
          selection: { ...selection, excludeAttached: true },
        })
      ).json(),
    ).toEqual({ ahead: [], behind: [] });
  });

  it("breaks equal timestamps by sequence and crosses days newest first", async () => {
    const context = await _context();
    const first = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 10,
    });
    const second = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 20,
    });
    const older = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      captured_on: "2026-09-25",
      captured_at: "2026-09-25T10:00:00.000Z",
      seq: 30,
    });
    const newer = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      captured_on: "2026-09-29",
      captured_at: "2026-09-29T10:00:00.000Z",
      seq: 40,
    });
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: second,
            direction: "next",
            selection: SELECTION,
          })
        ).json(),
      ),
    ).toEqual({ ahead: [older], behind: [first] });
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: first,
            direction: "previous",
            selection: SELECTION,
          })
        ).json(),
      ),
    ).toEqual({ ahead: [newer], behind: [second] });
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: first,
            direction: "previous",
            selection: { ...SELECTION, until: "2026-09-27" },
          })
        ).json(),
      ),
    ).toEqual({ ahead: [], behind: [second] });
    await context.database
      .deleteFrom("items")
      .where("id", "=", first)
      .execute();
    expect(
      (
        await context.post("neighbors", {
          itemId: first,
          direction: "next",
          selection: SELECTION,
        })
      ).json(),
    ).toEqual({ ahead: [], behind: [] });
  });

  it("allows selected original-video renewal without speculative original playback or opens", async () => {
    const context = await _context();
    const itemId = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      kind: "video",
    });
    await insertRendition(context.database, {
      itemId,
      purpose: "original",
      content_type: "video/quicktime",
      byte_size: 90_000_000,
    });
    const precedingPhoto = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 1,
      captured_at: "2026-09-27T00:00:00.000Z",
    });
    const before = await _snapshot(context.database);
    const neighbors = await context.post("neighbors", {
      itemId: precedingPhoto,
      selection: SELECTION,
      direction: "next",
    });
    expect(neighbors.json().ahead[0]).toMatchObject({
      itemId,
      media: { playback: null },
    });
    const speculative = await context.post("preview", {
      itemIds: [itemId],
      purpose: "speculative-preview",
    });
    expect(speculative.statusCode).toBe(200);
    expect(speculative.json().items[0].media.playback).toBeNull();
    const selected = await context.post("preview", {
      itemIds: [itemId],
      purpose: "selected-view",
    });
    expect(selected.json().items[0].media.playback).toMatchObject({
      purpose: "original",
      contentType: "video/quicktime",
    });
    context.app.clock = () => {
      return new Date(new Date(NOW).getTime() + 3_540_000);
    };
    const renewed = await context.post("preview", {
      itemIds: [itemId],
      purpose: "selected-view",
    });
    expect(renewed.json().items[0].media.playback.issuedAt).not.toBe(
      selected.json().items[0].media.playback.issuedAt,
    );
    expect(renewed.json().items[0].media.playback.expiresAt).not.toBe(
      selected.json().items[0].media.playback.expiresAt,
    );
    expect(await _snapshot(context.database)).toEqual(before);
  });
  it("moves a partially visible stack to its earliest visible frame", async () => {
    const context = await _context();
    const { before, frameIds } = await _burst(context);
    const rule = await insertVisibilityRule(context.database, { mode: "only" });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: rule })
      .where("id", "=", frameIds[0]!)
      .execute();
    const between = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 50,
      captured_at: "2026-09-27T12:00:30.000Z",
    });
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: before,
            selection: SELECTION,
            direction: "next",
          })
        ).json(),
      ).ahead,
    ).toEqual([between, frameIds[1]]);
  });

  it("breaks equal burst indices by ID in both directions", async () => {
    const context = await _context();
    const { before, frameIds } = await _burst(context);
    await context.database
      .updateTable("items")
      .set({ burst_index: 1 })
      .where("id", "=", frameIds[2]!)
      .execute();
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: before,
            selection: SELECTION,
            direction: "next",
          })
        ).json(),
      ).ahead,
    ).toEqual([frameIds[1], frameIds[2]]);
    expect(
      _ids(
        (
          await context.post("neighbors", {
            itemId: frameIds[2],
            selection: SELECTION,
            direction: "previous",
          })
        ).json(),
      ).ahead,
    ).toEqual([frameIds[1], before]);
  });

  it("requires a session and shares the authenticated rate limit", async () => {
    const context = await _context();
    const payload = { itemIds: [createId()], purpose: "speculative-preview" };
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/media/preview",
          payload,
        })
      ).statusCode,
    ).toBe(401);
    const responses = await Promise.all(
      Array.from({ length: 601 }, () => {
        return context.post("preview", payload);
      }),
    );
    expect(
      responses.filter((response) => {
        return response.statusCode === 429;
      }),
    ).toHaveLength(1);
    expect(
      (
        await context.post("neighbors", {
          itemId: payload.itemIds[0],
          selection: SELECTION,
          direction: "next",
        })
      ).statusCode,
    ).toBe(429);
  });

  it("keeps statement and returned-row counts bounded as the archive and burst grow", async () => {
    const context = await _context();
    const { after, burstId } = await _burst(context);
    const queries: CompiledQuery[] = [];
    const rowCounts: number[] = [];
    const compiled = new WeakMap<object, CompiledQuery>();
    const database = context.database.withPlugin({
      transformQuery: (args) => {
        compiled.set(
          args.queryId,
          context.database.getExecutor().compileQuery(args.node, args.queryId),
        );
        return args.node;
      },
      transformResult: async (args) => {
        queries.push(compiled.get(args.queryId)!);
        rowCounts.push(args.result.rows.length);
        return args.result;
      },
    });
    const read = () => {
      return readMediaNeighbors({
        database,
        b2: context.b2,
        now: new Date(NOW),
        viewer: {
          memberId: context.memberId,
          sessionId: context.sessionId,
          role: "viewer",
          isAdmin: false,
          visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
        },
        request: { itemId: after, direction: "previous", selection: SELECTION },
      });
    };
    await read();
    const smallCount = queries.length;
    const smallRows = [...rowCounts];
    await Promise.all(
      Array.from({ length: 1000 }, (_, index) => {
        return insertItem(context.database, {
          uploadedBy: context.uploaderId,
          seq: index + 100,
          burst_id: index < 500 ? burstId : null,
          burst_index: index < 500 ? index + 100 : null,
          captured_at: "2026-09-27T12:30:00.000Z",
          captured_on: index < 500 ? "2026-09-27" : "2026-09-29",
        });
      }),
    );
    queries.length = 0;
    rowCounts.length = 0;
    const result = await read();
    expect(result.ahead).toHaveLength(2);
    expect(result.behind).toHaveLength(0);
    expect(queries.length).toBe(smallCount);
    expect(queries.length).toBeLessThanOrEqual(16);
    expect(Math.max(...smallRows, ...rowCounts)).toBeLessThanOrEqual(3);
    const plans = await Promise.all(
      queries.map((query) => {
        return context.database.executeQuery<{ detail: string }>(
          CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [
            ...query.parameters,
          ]),
        );
      }),
    );
    const details = plans.flatMap((plan) => {
      return plan.rows.map((row) => {
        return row.detail;
      });
    });
    [
      "items_navigation_capture",
      "items_navigation_burst_capture",
      "items_navigation_burst_frame",
    ].forEach((index) => {
      expect(
        details.some((detail) => {
          return detail.includes(`USING INDEX ${index} `);
        }),
      ).toBe(true);
    });
    expect(
      details.filter((detail) => {
        return detail.includes("TEMP B-TREE");
      }),
    ).toEqual([]);
  });
});
