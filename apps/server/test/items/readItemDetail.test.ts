import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { readItemDetail } from "../../src/items/readItemDetail/readItemDetail.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  insertBurst,
  insertComment,
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertItemView,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
  setBurstCover,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const readDetail = async (options: {
  database: Kysely<Database>;
  viewer: Viewer;
  itemId: string;
}) => {
  return readItemDetail({
    database: options.database,
    b2: createFakeB2Client(),
    viewer: options.viewer,
    item: await getVisibleItemOr404({
      database: options.database,
      viewer: options.viewer,
      itemId: options.itemId,
    }),
    now: new Date(NOW),
  });
};

describe("readItemDetail", () => {
  it("composes alt text from the people and the date, and keeps the override apart", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database, { display_name: "Papá" });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      captured_at: "2026-09-14T04:41:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId: mateoId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(detail.media.altText).toBe("Mateo, 14 September 2026");
    expect(detail.altTextOverride).toBeNull();
    expect(detail.people).toEqual([
      { personId: mateoId, displayName: "Mateo" },
    ]);
    await database.destroy();
  });

  it("numbers the item inside its burst over the visible frames alone", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const viewerMemberId = await insertMember(database, { role: "viewer" });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const frameIds = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: uploaderId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_at: `2026-09-14T06:4${index}:00.000Z`,
          captured_on: "2026-09-14",
          visibility_rule_id:
            index === 1 ? hiddenRuleId : "visibility-rule-everyone",
        });
        await insertRendition(database, { itemId });
        return itemId;
      }),
    );
    await setBurstCover(database, { burstId, coverItemId: frameIds[0] ?? "" });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId: viewerMemberId, role: "viewer" }),
      itemId: frameIds[2] ?? "",
    });

    expect(detail.burst?.visibleFrameCount).toBe(2);
    expect(detail.burstPosition).toBe(2);
    expect(
      detail.burstFrames.map((frame) => {
        return frame.position;
      }),
    ).toEqual([1, 2]);
    // The stored cover is restricted, so it falls back to the earliest
    // visible frame rather than naming a frame this viewer cannot open.
    expect(detail.burst?.coverItemId).toBe(frameIds[1]);
    expect(detail.burst?.startsAt).toBe("2026-09-14T06:42:00.000Z");
    await database.destroy();
  });

  it("numbers burstPosition over the counted rows, not over the drawn strip", async () => {
    // The one place two numbering schemes could silently disagree. A sibling
    // that passes the predicate but carries no rendition is counted by
    // `visibleFrameCount` (which is the pile's count, and must agree with it)
    // and is dropped from the strip, which renumbers densely.
    //
    // `burstPosition` follows the count rather than the strip, because the
    // contract reads the one against the other: "1-based over the visible
    // siblings, against `burst.visibleFrameCount`". Numbering it over the
    // strip made it null for every frame past `burstStripMaxFrames`, which is
    // precisely the frame a viewer reaches through the frames route. The
    // price is here: the caption says 3 of 3 above a thumbnail the strip
    // marks 2, because an ingest defect lost the frame between them. The
    // caption and its own denominator still agree, which is the pair a
    // viewer actually reads.
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: uploaderId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_at: `2026-09-14T06:4${index}:00.000Z`,
          captured_on: "2026-09-14",
        });
        // The first frame is visible and undrawable, which is an ingest
        // defect rather than a permission one.
        if (index !== 1) {
          await insertRendition(database, { itemId });
        }
        return itemId;
      }),
    );

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId: uploaderId }),
      itemId: frameIds[2] ?? "",
    });

    expect(detail.burst?.visibleFrameCount).toBe(3);
    expect(
      detail.burstFrames.map((frame) => {
        return [frame.itemId, frame.position];
      }),
    ).toEqual([
      [frameIds[1], 1],
      [frameIds[2], 2],
    ]);
    expect(detail.burstPosition).toBe(3);
    await database.destroy();
  });

  it("reports an unseen sibling without dropping the seen ones", async () => {
    // The anti-join that answers `hasUnseenFrames` puts the member predicate
    // in the `ON` clause. In the `WHERE` it would turn the left join inner
    // and every seen frame would vanish from the strip and from the count,
    // which is why the count is asserted here beside the flag.
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [1, 2].map(async (index) => {
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
    await insertItemView(database, { memberId, itemId: frameIds[0] ?? "" });
    const viewer = makeViewer({ memberId });
    const itemId = frameIds[0] ?? "";

    const withOneUnseen = await readDetail({ database, viewer, itemId });
    expect(withOneUnseen.burst?.visibleFrameCount).toBe(2);
    expect(withOneUnseen.burst?.hasUnseenFrames).toBe(true);

    await insertItemView(database, { memberId, itemId: frameIds[1] ?? "" });
    const withNoneUnseen = await readDetail({ database, viewer, itemId });
    expect(withNoneUnseen.burst?.visibleFrameCount).toBe(2);
    expect(withNoneUnseen.burst?.hasUnseenFrames).toBe(false);
    await database.destroy();
  });

  it("counts and spans the whole burst, not the strip the cap allows", async () => {
    // `burstStripMaxFrames` caps `burstFrames` and **only** `burstFrames`.
    // `visibleFrameCount` is what tells the client there is more to fetch
    // from `GET /api/bursts/:burstId/frames`, so a count read off the capped
    // window can never exceed the cap and could never say so. The span and
    // `hasUnseenFrames` are measured over the same true set, for the same
    // reason the stored span is not used: a capped one is unfiltered in the
    // other direction.
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-27",
    });
    const frameCount = appConfig.items.burstStripMaxFrames + 1;
    const frameIds: string[] = [];
    for (let index = 1; index <= frameCount; index += 1) {
      const itemId = await insertItem(database, {
        uploadedBy: memberId,
        seq: index,
        burst_id: burstId,
        burst_index: index,
        captured_at: shiftMinutes({ instant: NOW, minutes: index }),
      });
      await insertRendition(database, { itemId });
      // Every frame but the last has been in front of this viewer, so only a
      // sibling past the cap is unseen.
      if (index < frameCount) {
        await insertItemView(database, { memberId, itemId });
      }
      frameIds.push(itemId);
    }
    const lastFrameId = frameIds[frameCount - 1] ?? "";

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId: lastFrameId,
    });

    expect(detail.burst?.visibleFrameCount).toBe(frameCount);
    expect(detail.burstFrames).toHaveLength(
      appConfig.items.burstStripMaxFrames,
    );
    expect(detail.burstPosition).toBe(frameCount);
    expect(detail.burst?.startsAt).toBe(
      shiftMinutes({ instant: NOW, minutes: 1 }),
    );
    expect(detail.burst?.endsAt).toBe(
      shiftMinutes({ instant: NOW, minutes: frameCount }),
    );
    expect(detail.burst?.hasUnseenFrames).toBe(true);
    await database.destroy();
  });

  it("draws a burst of one visible frame as a plain print", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      burst_id: burstId,
      burst_index: 1,
    });
    await insertRendition(database, { itemId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId: uploaderId }),
      itemId,
    });

    expect(detail.burst).toBeNull();
    expect(detail.burstPosition).toBeNull();
    expect(detail.burstFrames).toEqual([]);
    await database.destroy();
  });

  it("reports the state the viewer arrived in", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const unseenId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const seenId = await insertItem(database, { uploadedBy: memberId, seq: 2 });
    await Promise.all([
      insertRendition(database, { itemId: unseenId }),
      insertRendition(database, { itemId: seenId }),
    ]);
    await insertItemView(database, { memberId, itemId: seenId });
    const viewer = makeViewer({ memberId });

    expect(
      (await readDetail({ database, viewer, itemId: unseenId })).isUnseen,
    ).toBe(true);
    expect(
      (await readDetail({ database, viewer, itemId: seenId })).isUnseen,
    ).toBe(false);
    await database.destroy();
  });

  it("says whether an attached milestone's span still contains the item", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });
    const insideId = await insertMilestone(database, {
      name: "The birthday",
      startsOn: "2026-09-14",
    });
    const outsideId = await insertMilestone(database, {
      name: "A week at the grandparents'",
      startsOn: "2026-08-01",
      endsOn: "2026-08-08",
    });
    await insertItemMilestone(database, { itemId, milestoneId: insideId });
    await insertItemMilestone(database, { itemId, milestoneId: outsideId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(
      detail.milestones.map((milestone) => {
        return [milestone.name, milestone.spanContainsCapturedOn];
      }),
    ).toEqual(
      expect.arrayContaining([
        ["The birthday", true],
        ["A week at the grandparents'", false],
      ]),
    );
    await database.destroy();
  });

  it("offers the ask to a tagged viewer and withholds it from the uploader", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const taggedMemberId = await insertMember(database, { role: "viewer" });
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertRendition(database, { itemId });
    const personId = await insertPerson(database, {
      displayName: "Marisol",
      member_id: taggedMemberId,
    });
    await insertItemPerson(database, { itemId, personId });

    const forTagged = await readDetail({
      database,
      viewer: makeViewer({ memberId: taggedMemberId, role: "viewer" }),
      itemId,
    });
    const forUploader = await readDetail({
      database,
      viewer: makeViewer({ memberId: uploaderId }),
      itemId,
    });

    expect(forTagged.capabilities.canRequestRemoval).toBe(true);
    expect(forTagged.capabilities.canDelete).toBe(false);
    expect(forUploader.capabilities.canRequestRemoval).toBe(false);
    expect(forUploader.capabilities.canDelete).toBe(true);
    await database.destroy();
  });

  it("carries the tags and the rule's id, so the controls can pre-fill", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const tagId = await insertTag(database, { name: "Hospital" });
    await insertItemTag(database, { itemId, tagId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(detail.tags).toEqual([{ tagId, name: "Hospital" }]);
    expect(detail.visibility.visibilityRuleId).toBe("visibility-rule-everyone");
    await database.destroy();
  });

  it("refuses to serve a video whose duration was never written", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: null,
    });
    await insertRendition(database, { itemId });

    await expect(
      readDetail({ database, viewer: makeViewer({ memberId }), itemId }),
    ).rejects.toThrow(/duration/iu);
    await database.destroy();
  });

  it("costs the same whatever the thread's length and the burst's size", async () => {
    /**
     * Seeds one permalink and returns what reading it costs.
     *
     * `frameCount` of zero is an item outside any burst, which skips the
     * sibling read, the aggregate beside it and the cover read outright, so a
     * burst permalink is dearer than a plain one by a constant. The property
     * under test is that neither number grows with the thread or the strip.
     */
    async function _countQueriesForPermalink(options: {
      commentCount: number;
      frameCount: number;
    }): Promise<number> {
      const counting = makeQueryCountingDatabaseFromDatabase(
        createDatabase(":memory:"),
      );
      const { database } = counting;
      await migrateToLatest(database);
      const memberId = await insertMember(database);
      const burstId =
        options.frameCount === 0
          ? null
          : await insertBurst(database, {
              uploadSessionId: await insertUploadSession(database, {
                uploadedBy: memberId,
              }),
              capturedOn: "2026-09-14",
            });

      const itemIds = await Promise.all(
        Array.from(
          { length: Math.max(options.frameCount, 1) },
          async (_unused, index) => {
            const itemId = await insertItem(database, {
              uploadedBy: memberId,
              seq: index + 1,
              burst_id: burstId,
              burst_index: burstId === null ? null : index + 1,
              captured_on: "2026-09-14",
            });
            await insertRendition(database, { itemId });
            const personId = await insertPerson(database, {
              displayName: `Person ${index}`,
            });
            await insertItemPerson(database, { itemId, personId });
            return itemId;
          },
        ),
      );

      const itemId = itemIds[0] ?? "";
      await Promise.all(
        Array.from({ length: options.commentCount }, (_unused, index) => {
          return insertComment(database, {
            itemId,
            authorMemberId: memberId,
            created_at: `2026-09-27T10:0${index}:00.000Z`,
          });
        }),
      );

      counting.reset();
      await readDetail({ database, viewer: makeViewer({ memberId }), itemId });
      const queryCount = counting.getQueryCount();
      await database.destroy();
      return queryCount;
    }

    const smallBurst = await _countQueriesForPermalink({
      commentCount: 1,
      frameCount: 3,
    });
    const largeBurst = await _countQueriesForPermalink({
      commentCount: 12,
      frameCount: 12,
    });
    const plainPrint = await _countQueriesForPermalink({
      commentCount: 1,
      frameCount: 0,
    });
    const chattyPlainPrint = await _countQueriesForPermalink({
      commentCount: 12,
      frameCount: 0,
    });

    // Sixteen for a burst permalink and thirteen for a plain one, both
    // including the `getVisibleItemOr404` lookup the route runs first.
    expect(largeBurst).toBe(smallBurst);
    expect(chattyPlainPrint).toBe(plainPrint);
    // The burst's whole constant: the capped sibling read, the one aggregate
    // over the whole visible burst beside it, and the cover read. Nothing
    // else. The strip is composed from the same `mediaSources`,
    // `peopleByItemId` and timezone the item's own batch already holds, which
    // is what `items.md` § Performance queries 3 and 6 mean by one batched
    // read covering the item **and** the strip. It was five until the
    // query-count test in `routes/__tests__/itemDetail.queryPlan` said so. The
    // aggregate is the one read that cannot be folded into the rows: they are
    // capped, and every figure it answers is over the whole visible burst.
    expect(smallBurst - plainPrint).toBe(3);
  });
});
