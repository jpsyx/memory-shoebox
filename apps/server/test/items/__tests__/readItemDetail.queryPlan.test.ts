import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import {
  insertBurst,
  insertComment,
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertUploadSession,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { readDetail } from "./readItemDetailTestHelpers.ts";

/**
 * Seeds one permalink and returns what reading it costs.
 *
 * `frameCount` of zero is an item outside any burst, which skips the sibling
 * read, the aggregate beside it and the cover read outright, so a burst
 * permalink is dearer than a plain one by a constant.
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

describe("readItemDetail's query plan", () => {
  it("costs the same whatever the thread's length and the burst's size", async () => {
    // Sixteen for a burst permalink and thirteen for a plain one, both
    // including the `getVisibleItemOr404` lookup the route runs first. The
    // property is that neither number moves with the thread or the strip.
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

    expect(largeBurst).toBe(smallBurst);
    expect(chattyPlainPrint).toBe(plainPrint);
  });

  it("costs a burst three queries more than a plain print", async () => {
    const smallBurst = await _countQueriesForPermalink({
      commentCount: 1,
      frameCount: 3,
    });
    const plainPrint = await _countQueriesForPermalink({
      commentCount: 1,
      frameCount: 0,
    });

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
