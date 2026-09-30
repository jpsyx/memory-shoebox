import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

/**
 * Every route that takes an item-derived id answers **one** 404.
 *
 * An invisible item and an id that never existed must be byte-identical on
 * the wire: same status, same body, no `details` on either
 * (`conventions.md` § Errors, `data-models.md` § The evaluation). A `403`
 * that arrived first would be an existence oracle, which is exactly what the
 * counting rule exists to prevent, so the role check never runs before
 * `getVisibleItemOr404` has.
 */

/** One route, addressed by an id it will never resolve. */
type NotFoundCase = {
  name: string;
  method: "GET" | "PATCH" | "PUT" | "POST" | "DELETE";
  path: (id: string) => string;
  payload?: Record<string, unknown>;
  /** The resource the caller addressed, never the one behind it. */
  code: "item_not_found" | "comment_not_found";
};

const ITEM_CASES: readonly NotFoundCase[] = [
  {
    name: "GET /api/items/:itemId",
    method: "GET",
    path: (id) => {
      return `/api/items/${id}`;
    },
    code: "item_not_found",
  },
  {
    name: "GET /api/items/:itemId/original",
    method: "GET",
    path: (id) => {
      return `/api/items/${id}/original`;
    },
    code: "item_not_found",
  },
  {
    name: "PATCH /api/items/:itemId",
    method: "PATCH",
    path: (id) => {
      return `/api/items/${id}`;
    },
    payload: { altText: null },
    code: "item_not_found",
  },
  {
    name: "DELETE /api/items/:itemId",
    method: "DELETE",
    path: (id) => {
      return `/api/items/${id}`;
    },
    code: "item_not_found",
  },
  {
    name: "PUT /api/items/:itemId/tags",
    method: "PUT",
    path: (id) => {
      return `/api/items/${id}/tags`;
    },
    payload: { tags: [] },
    code: "item_not_found",
  },
  {
    name: "PUT /api/items/:itemId/people",
    method: "PUT",
    path: (id) => {
      return `/api/items/${id}/people`;
    },
    payload: { people: [] },
    code: "item_not_found",
  },
  {
    name: "PATCH /api/items/:itemId/visibility",
    method: "PATCH",
    path: (id) => {
      return `/api/items/${id}/visibility`;
    },
    payload: { visibilityRuleId: "visibility-rule-everyone" },
    code: "item_not_found",
  },
  {
    name: "POST /api/items/:itemId/capture-date",
    method: "POST",
    path: (id) => {
      return `/api/items/${id}/capture-date`;
    },
    payload: { capturedOn: "2026-09-20" },
    code: "item_not_found",
  },
  {
    name: "POST /api/items/:itemId/comments",
    method: "POST",
    path: (id) => {
      return `/api/items/${id}/comments`;
    },
    payload: { body: "Hello" },
    code: "item_not_found",
  },
  {
    name: "PUT /api/items/:itemId/reaction",
    method: "PUT",
    path: (id) => {
      return `/api/items/${id}/reaction`;
    },
    payload: { kind: "love" },
    code: "item_not_found",
  },
  {
    name: "DELETE /api/items/:itemId/reaction",
    method: "DELETE",
    path: (id) => {
      return `/api/items/${id}/reaction`;
    },
    code: "item_not_found",
  },
];

/** The comment routes, which reach their item through `comments.item_id`. */
const COMMENT_CASES: readonly NotFoundCase[] = [
  {
    name: "PATCH /api/comments/:commentId",
    method: "PATCH",
    path: (id) => {
      return `/api/comments/${id}`;
    },
    payload: { body: "A correction" },
    code: "comment_not_found",
  },
  {
    name: "DELETE /api/comments/:commentId",
    method: "DELETE",
    path: (id) => {
      return `/api/comments/${id}`;
    },
    code: "comment_not_found",
  },
  {
    name: "PUT /api/comments/:commentId/reaction",
    method: "PUT",
    path: (id) => {
      return `/api/comments/${id}/reaction`;
    },
    payload: { kind: "love" },
    code: "comment_not_found",
  },
  {
    name: "DELETE /api/comments/:commentId/reaction",
    method: "DELETE",
    path: (id) => {
      return `/api/comments/${id}/reaction`;
    },
    code: "comment_not_found",
  },
];

/** One archive holding one photograph nobody in these tests may see. */
type ParityFixture = {
  app: FastifyInstance;
  database: Kysely<Database>;
  close: () => Promise<void>;
  /** An uploader, so nothing but the predicate can refuse them. */
  cookie: string;
  memberId: string;
  /** Restricted to its own uploader, who is nobody in these tests. */
  invisibleItemId: string;
  /** Said by the stranger, on the item above. */
  invisibleCommentId: string;
};

/**
 * An item and a comment the actor may not see, beside nothing else.
 *
 * The actor is an `uploader` rather than a `viewer`, so that every route's
 * role gate would pass: what these tests prove is that the 404 arrives before
 * the gate is reached, and a viewer's 403 would be indistinguishable from one.
 */
async function makeParityFixture(): Promise<ParityFixture> {
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const strangerId = await insertMember(database);
  const ruleId = await insertVisibilityRule(database, { mode: "only" });
  await insertVisibilityRuleSubject(database, {
    ruleId,
    memberId: strangerId,
  });
  const invisibleItemId = await insertItem(database, {
    uploadedBy: strangerId,
    visibility_rule_id: ruleId,
  });
  await insertRendition(database, { itemId: invisibleItemId });
  await insertRendition(database, {
    itemId: invisibleItemId,
    purpose: "original",
  });

  const invisibleCommentId = createId();
  await database
    .insertInto("comments")
    .values({
      id: invisibleCommentId,
      item_id: invisibleItemId,
      author_member_id: strangerId,
      body: "Something only the stranger can read",
      at_seconds: null,
      created_at: NOW,
      edited_at: null,
    })
    .execute();

  const actor = await insertSignedInMember({ database, token: "actor" });
  return {
    app,
    database,
    close,
    cookie: actor.cookie,
    memberId: actor.memberId,
    invisibleItemId,
    invisibleCommentId,
  };
}

/** The two responses a parity case compares, taken back to back. */
async function getParityResponses(options: {
  fixture: ParityFixture;
  notFoundCase: NotFoundCase;
  invisibleId: string;
  cookie?: string;
}): Promise<{ invisible: string; nonexistent: string; status: number }> {
  const { fixture, notFoundCase } = options;
  const cookie = options.cookie ?? fixture.cookie;
  const request = async (id: string) => {
    return fixture.app.inject({
      method: notFoundCase.method,
      url: notFoundCase.path(id),
      headers: { cookie },
      ...(notFoundCase.payload === undefined
        ? {}
        : { payload: notFoundCase.payload }),
    });
  };

  const invisible = await request(options.invisibleId);
  const nonexistent = await request(createId());

  expect(invisible.statusCode).toBe(nonexistent.statusCode);
  expect(invisible.json().details).toBeUndefined();
  expect(nonexistent.json().details).toBeUndefined();
  expect(invisible.json()).toEqual({
    error: notFoundCase.code,
    message: "Not found.",
  });

  return {
    invisible: invisible.body,
    nonexistent: nonexistent.body,
    status: invisible.statusCode,
  };
}

describe("one 404, byte-identical on every route", () => {
  // One app for every case, which is the point: the two answers a case
  // compares come out of the same process, over the same seeded archive.
  let builtFixture: ParityFixture | undefined;

  /** The fixture, or the failure that says `beforeAll` did not run. */
  function getFixture(): ParityFixture {
    if (builtFixture === undefined) {
      throw new Error("The parity fixture was never built.");
    }
    return builtFixture;
  }

  beforeAll(async () => {
    builtFixture = await makeParityFixture();
  });

  afterAll(async () => {
    await getFixture().close();
  });

  ITEM_CASES.forEach((notFoundCase) => {
    it(`${notFoundCase.name} cannot tell an invisible item from one that never existed`, async () => {
      const fixture = getFixture();
      const { invisible, nonexistent, status } = await getParityResponses({
        fixture,
        notFoundCase,
        invisibleId: fixture.invisibleItemId,
      });

      expect(status).toBe(404);
      expect(invisible).toBe(nonexistent);
    });
  });

  COMMENT_CASES.forEach((notFoundCase) => {
    it(`${notFoundCase.name} keeps its 404 about the comment`, async () => {
      // The item is what the viewer may not see, and the comment is what the
      // caller addressed: the code names the second, never the first, or the
      // pair of codes is itself the oracle.
      const fixture = getFixture();
      const { invisible, nonexistent, status } = await getParityResponses({
        fixture,
        notFoundCase,
        invisibleId: fixture.invisibleCommentId,
      });

      expect(status).toBe(404);
      expect(invisible).toBe(nonexistent);
    });
  });

  it("is a 404 and never a 403 for a viewer who cannot see it", async () => {
    // A `viewer` is refused every mutating route in the slice, so this is the
    // one actor for whom a role check running first would be visible. Every
    // answer here must still be the 404, and never `item_edit_forbidden`,
    // `item_visibility_forbidden`, `item_capture_date_forbidden` or
    // `item_delete_forbidden`.
    const fixture = getFixture();
    const { cookie } = await insertSignedInMember({
      database: fixture.database,
      token: "a-viewer-who-may-change-nothing",
      member: { role: "viewer" },
    });

    const answers = await Promise.all(
      ITEM_CASES.map(async (notFoundCase) => {
        const responses = await getParityResponses({
          fixture,
          notFoundCase,
          invisibleId: fixture.invisibleItemId,
          cookie,
        });
        return {
          name: notFoundCase.name,
          status: responses.status,
          identical: responses.invisible === responses.nonexistent,
        };
      }),
    );

    expect(answers).toEqual(
      ITEM_CASES.map((notFoundCase) => {
        return { name: notFoundCase.name, status: 404, identical: true };
      }),
    );
  });

  it("does not make item_people a key", async () => {
    // A photograph restricted to admins, people-tagged for a viewer whose
    // linked person is on it. Being in a photograph is not a key to it
    // (Decision 7): the tag gate only ever subtracts, so the item is a 404 on
    // every route above and absent from that viewer's timeline.
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const adminId = await insertMember(database, { role: "admin" });
    const adminsOnlyRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: adminsOnlyRuleId,
      memberId: adminId,
    });
    const itemId = await insertItem(database, {
      uploadedBy: adminId,
      visibility_rule_id: adminsOnlyRuleId,
      captured_on: "2026-09-27",
    });
    await insertRendition(database, { itemId });
    await insertRendition(database, { itemId, purpose: "original" });

    const tagged = await insertSignedInMember({
      database,
      token: "the-person-in-the-photograph",
    });
    const personId = await insertPerson(database, {
      displayName: "Whoever is in it",
      member_id: tagged.memberId,
    });
    await insertItemPerson(database, { itemId, personId });

    const statuses = await Promise.all(
      ITEM_CASES.map(async (notFoundCase) => {
        const response = await app.inject({
          method: notFoundCase.method,
          url: notFoundCase.path(itemId),
          headers: { cookie: tagged.cookie },
          ...(notFoundCase.payload === undefined
            ? {}
            : { payload: notFoundCase.payload }),
        });
        return {
          name: notFoundCase.name,
          status: response.statusCode,
          error: response.json().error,
        };
      }),
    );

    expect(statuses).toEqual(
      ITEM_CASES.map((notFoundCase) => {
        return {
          name: notFoundCase.name,
          status: 404,
          error: "item_not_found",
        };
      }),
    );

    const timeline = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: tagged.cookie },
    });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json()).toEqual({
      days: [],
      nextCursor: null,
      resultCount: null,
    });
    expect(timeline.body).not.toContain(itemId);

    // The rail is the other surface a day count reaches, and the same tag
    // must not put a band on it either.
    const rail = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie: tagged.cookie },
    });
    expect(rail.json()).toEqual({ days: [], nextCursor: null });

    await close();
  });

  it("refuses a selection holding one invisible id with the same 404", async () => {
    // `POST /api/items/visibility` takes its ids in the body rather than the
    // path, and one miss fails the whole request: no `details` naming which
    // id failed, because a list of the ids that survived is a count of what
    // the viewer cannot see.
    const fixture = getFixture();
    const mine = await insertItem(fixture.database, {
      uploadedBy: fixture.memberId,
      seq: 900,
    });
    await insertRendition(fixture.database, { itemId: mine });

    const withInvisible = await fixture.app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie: fixture.cookie },
      payload: {
        itemIds: [mine, fixture.invisibleItemId],
        visibilityRuleId: "visibility-rule-everyone",
      },
    });
    const withNonexistent = await fixture.app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie: fixture.cookie },
      payload: {
        itemIds: [mine, createId()],
        visibilityRuleId: "visibility-rule-everyone",
      },
    });

    expect(withInvisible.statusCode).toBe(404);
    expect(withInvisible.body).toBe(withNonexistent.body);
    expect(withInvisible.json()).toEqual({
      error: "item_not_found",
      message: "Not found.",
    });
  });
});
