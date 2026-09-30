import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { expect } from "vitest";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

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
export type NotFoundCase = {
  name: string;
  method: "GET" | "PATCH" | "PUT" | "POST" | "DELETE";
  path: (id: string) => string;
  payload?: Record<string, unknown>;
  /** The resource the caller addressed, never the one behind it. */
  code: "item_not_found" | "comment_not_found";
};

export const ITEM_CASES: readonly NotFoundCase[] = [
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
export const COMMENT_CASES: readonly NotFoundCase[] = [
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
export type ParityFixture = {
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
export async function makeParityFixture(): Promise<ParityFixture> {
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
export async function getParityResponses(options: {
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
