import { describe, expect, it } from "vitest";
import { appConfig } from "../../../../../app.config.ts";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import {
  NOW,
  insertBurst,
  insertItem,
  insertItemView,
  insertMember,
  insertRendition,
  insertUploadSession,
  insertVisibilityRule,
  setBurstCover,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { readDetail } from "./readItemDetailTestHelpers.ts";

describe("readItemDetail's burst strip", () => {
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
});
