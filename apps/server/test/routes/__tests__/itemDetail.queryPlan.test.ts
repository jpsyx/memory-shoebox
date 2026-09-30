import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { createId } from "../../../src/db/createId.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertBurst,
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/**
 * What one permalink costs, and that it does not move with what is on it.
 *
 * The four N+1 risks `items.md` § Performance names, each of them
 * reasonable-looking code: the thread's reactions, the strip's people, the
 * strip's renditions, and the members table. The property is that the count is
 * flat in the thread's length, in the strip's size and in the number of people
 * who said something, not that any one number is small.
 */

/** One permalink's archive, in the dimensions the N+1 risks live along. */
type PermalinkShape = {
  /** Comments on the item, authored round robin by the members below. */
  comments: number;
  /** One reaction on each comment, which is the `comment_id IN (...)` risk. */
  reactToEveryComment: boolean;
  /** Members besides the uploader, each of whom reacts to the item. */
  reactors: number;
  /** Frames in the item's burst. Zero is a plain print, outside any burst. */
  frames: number;
};

/**
 * Seeds one archive of that shape and counts what `GET /api/items/:itemId`
 * costs against it.
 *
 * The count covers the whole request, the session lookup and both latches
 * included, because that is what a permalink actually costs. Only the
 * differences between two shapes are ever asserted on.
 */
async function countPermalinkQueries(shape: PermalinkShape): Promise<number> {
  const counting = makeQueryCountingDatabaseFromDatabase(
    createDatabase(":memory:"),
  );
  const { app, database, close } = await createTestApp({
    database: counting.database,
    clock: () => {
      return new Date(NOW);
    },
  });

  const owner = await insertSignedInMember({ database });
  const others: string[] = [];
  for (let index = 0; index < shape.reactors; index += 1) {
    others.push(await insertMember(database));
  }
  const everybody = [owner.memberId, ...others];

  const burstId =
    shape.frames === 0
      ? null
      : await insertBurst(database, {
          uploadSessionId: await insertUploadSession(database, {
            uploadedBy: owner.memberId,
          }),
          capturedOn: "2026-09-27",
        });

  // Every frame carries a person, because every `BurstFrameRef.altText`
  // composes from that frame's own people: composing them one frame at a time
  // is the sixty queries hiding inside a `.map`.
  const frameIds: string[] = [];
  for (let index = 0; index < Math.max(shape.frames, 1); index += 1) {
    const frameId = await insertItem(database, {
      uploadedBy: owner.memberId,
      seq: index + 1,
      burst_id: burstId,
      burst_index: burstId === null ? null : index + 1,
    });
    await insertRendition(database, { itemId: frameId });
    await insertItemPerson(database, {
      itemId: frameId,
      personId: await insertPerson(database, {
        displayName: `Person ${index}`,
      }),
    });
    frameIds.push(frameId);
  }
  const itemId = frameIds[0] ?? "";

  for (let index = 0; index < shape.comments; index += 1) {
    const authorMemberId = everybody[index % everybody.length] ?? "";
    const commentId = createId();
    await database
      .insertInto("comments")
      .values({
        id: commentId,
        item_id: itemId,
        author_member_id: authorMemberId,
        body: "He has your father's chin.",
        at_seconds: null,
        created_at: shiftMinutes({ instant: NOW, minutes: index }),
        edited_at: null,
      })
      .execute();
    if (shape.reactToEveryComment) {
      await database
        .insertInto("comment_reactions")
        .values({
          id: createId(),
          comment_id: commentId,
          member_id: authorMemberId,
          kind: "love",
          created_at: NOW,
        })
        .execute();
    }
  }

  for (const memberId of everybody) {
    await database
      .insertInto("item_reactions")
      .values({
        id: createId(),
        item_id: itemId,
        member_id: memberId,
        kind: "love",
        created_at: NOW,
      })
      .execute();
  }

  counting.reset();
  const response = await app.inject({
    method: "GET",
    url: `/api/items/${itemId}`,
    headers: { cookie: owner.cookie },
  });
  const queryCount = counting.getQueryCount();

  expect(response.statusCode).toBe(200);
  await close();
  return queryCount;
}

describe("GET /api/items/:itemId query plan", () => {
  it("costs the same for a thread of one comment and a thread of sixteen", async () => {
    // Sixteen comments and sixteen comment reactions must be one probe on
    // `comment_id IN (...)`, not sixteen probes: this is the N+1 the data
    // model calls out by name as "the easiest mistake in the item viewer".
    const quiet = await countPermalinkQueries({
      comments: 1,
      reactToEveryComment: true,
      reactors: 0,
      frames: 0,
    });
    const busy = await countPermalinkQueries({
      comments: 16,
      reactToEveryComment: true,
      reactors: 0,
      frames: 0,
    });

    expect(busy).toBe(quiet);
  });

  it("costs the same for a burst of three frames and one of forty-five", async () => {
    // Every BurstFrameRef carries an altText, and every alt text composes
    // from that frame's people. Composing them one frame at a time is sixty
    // queries hiding inside a `.map`.
    const shape = {
      comments: 1,
      reactToEveryComment: true,
      reactors: 0,
    } as const;
    const smallBurst = await countPermalinkQueries({ ...shape, frames: 3 });
    const largeBurst = await countPermalinkQueries({ ...shape, frames: 45 });

    expect(largeBurst).toBe(smallBurst);
  });

  it("costs a burst four queries more than a plain print", async () => {
    const shape = {
      comments: 1,
      reactToEveryComment: true,
      reactors: 0,
    } as const;
    const smallBurst = await countPermalinkQueries({ ...shape, frames: 3 });
    const plainPrint = await countPermalinkQueries({ ...shape, frames: 0 });

    // The burst's whole premium, and every part of it named: the capped
    // sibling rows, the one aggregate over the whole visible burst beside
    // them, the stored cover, and the one batched `item_views` latch that
    // clears the accent dot on the frames the strip put in front of the
    // viewer. **Nothing for the strip's renditions, its people or the
    // timezone**, which are queries 3 and 6 of `items.md` § Performance, each
    // one batched read covering the item **and** the strip. They were two
    // batched reads each until this test said so. The aggregate is the one
    // read that cannot be folded away: `visibleFrameCount`, the span and
    // `burstPosition` are measured over the whole visible burst, and the rows
    // beside them stop at `burstStripMaxFrames`.
    expect(smallBurst - plainPrint).toBe(4);
  });

  it("reads the members table once, however many people reacted", async () => {
    // Ten members each reacting, plus ten comment authors: the count must not
    // move with them. Joining `members` inside the comment, item-reaction and
    // comment-reaction queries would read it three times, and resolving a
    // `MemberRef` per author would read it twenty.
    const alone = await countPermalinkQueries({
      comments: 1,
      reactToEveryComment: true,
      reactors: 0,
      frames: 0,
    });
    const crowded = await countPermalinkQueries({
      comments: 10,
      reactToEveryComment: true,
      reactors: 10,
      frames: 0,
    });

    expect(crowded).toBe(alone);
  });
});
