import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/**
 * Every mutating route in the item slice, against the four kinds of viewer
 * the split actually distinguishes.
 *
 * One table in one file, so that a route added later without a row in it is
 * conspicuous. The expected column is `conventions.md` § Who may change an
 * item, which is binding: **if a row fails, fix the route, not the row.**
 * A mistake here is invisible in the interface and shows up as somebody
 * seeing, or destroying, a photograph they should not
 * (`plan/README.md`, which puts steps 3a and 5a on this).
 */

/** Who is asking, in the four kinds the split actually distinguishes. */
export type ViewerKind =
  | "viewer"
  | "otherUploader"
  | "owningUploader"
  | "admin";

/** One mutating route, and what each kind of viewer may do with it. */
export type RouteCase = {
  name: string;
  method: "PATCH" | "PUT" | "POST" | "DELETE";
  path: (itemId: string) => string;
  payload?: Record<string, unknown>;
  expected: Record<ViewerKind, number>;
};

/** Tags, people, alt text: any uploader or admin, on anything they can see. */
const ADDITIVE = {
  viewer: 403,
  otherUploader: 200,
  owningUploader: 200,
  admin: 200,
} as const;

/** Delete, visibility, capture date: the item's own uploader, or an admin. */
const ACCESS_CHANGING = {
  viewer: 403,
  otherUploader: 403,
  owningUploader: 200,
  admin: 200,
} as const;

export const ROUTES: readonly RouteCase[] = [
  {
    name: "PATCH /api/items/:itemId",
    method: "PATCH",
    path: (itemId) => {
      return `/api/items/${itemId}`;
    },
    payload: { altText: "A description" },
    expected: ADDITIVE,
  },
  {
    name: "PUT /api/items/:itemId/tags",
    method: "PUT",
    path: (itemId) => {
      return `/api/items/${itemId}/tags`;
    },
    payload: { tags: ["Hospital"] },
    expected: ADDITIVE,
  },
  {
    name: "PUT /api/items/:itemId/people",
    method: "PUT",
    path: (itemId) => {
      return `/api/items/${itemId}/people`;
    },
    payload: { people: [{ displayName: "Mamá" }] },
    expected: ADDITIVE,
  },
  {
    name: "PATCH /api/items/:itemId/visibility",
    method: "PATCH",
    path: (itemId) => {
      return `/api/items/${itemId}/visibility`;
    },
    payload: { visibilityRuleId: "visibility-rule-everyone" },
    expected: ACCESS_CHANGING,
  },
  {
    name: "POST /api/items/:itemId/capture-date",
    method: "POST",
    path: (itemId) => {
      return `/api/items/${itemId}/capture-date`;
    },
    payload: { capturedOn: "2026-09-20" },
    expected: ACCESS_CHANGING,
  },
  {
    name: "DELETE /api/items/:itemId",
    method: "DELETE",
    path: (itemId) => {
      return `/api/items/${itemId}`;
    },
    expected: { ...ACCESS_CHANGING, owningUploader: 204, admin: 204 },
  },
  {
    name: "POST /api/items/:itemId/comments",
    method: "POST",
    path: (itemId) => {
      return `/api/items/${itemId}/comments`;
    },
    payload: { body: "Anybody who can open it can say something" },
    expected: {
      viewer: 201,
      otherUploader: 201,
      owningUploader: 201,
      admin: 201,
    },
  },
  {
    name: "PUT /api/items/:itemId/reaction",
    method: "PUT",
    path: (itemId) => {
      return `/api/items/${itemId}/reaction`;
    },
    payload: { kind: "love" },
    expected: {
      viewer: 200,
      otherUploader: 200,
      owningUploader: 200,
      admin: 200,
    },
  },
  {
    name: "DELETE /api/items/:itemId/reaction",
    method: "DELETE",
    path: (itemId) => {
      return `/api/items/${itemId}/reaction`;
    },
    expected: {
      viewer: 204,
      otherUploader: 204,
      owningUploader: 204,
      admin: 204,
    },
  },
  {
    name: "POST /api/items/seen",
    method: "POST",
    path: () => {
      return "/api/items/seen";
    },
    payload: { itemIds: [], burstIds: [] },
    expected: {
      viewer: 204,
      otherUploader: 204,
      owningUploader: 204,
      admin: 204,
    },
  },
];

/**
 * The batch route takes a body rather than a path id, so it gets its own row
 * shape, and its ownership half is the one place in the slice that skips
 * rather than refuses.
 *
 * The role is still checked once for the request, so a `viewer` meets the
 * same 403 every other route gives them. Ownership is checked **per item**
 * (`items.md`): an uploader who owns none of the selection gets a `200` that
 * changed nothing and reports `skippedCount: 1`, which the test below
 * asserts. Nothing they may not change is changed either way, so the table
 * above still holds; only the shape of the refusal differs.
 */
export const BATCH_EXPECTED: Record<ViewerKind, number> = {
  viewer: 403,
  otherUploader: 200,
  owningUploader: 200,
  admin: 200,
};

/** The four kinds, in the order the matrix reads them. */
export const VIEWER_KINDS: readonly ViewerKind[] = [
  "viewer",
  "otherUploader",
  "owningUploader",
  "admin",
];

/** One archive holding one photograph, and a cookie for each kind of viewer. */
export type MatrixFixture = {
  app: FastifyInstance;
  database: Kysely<Database>;
  close: () => Promise<void>;
  actors: Record<ViewerKind, string>;
  /** Uploaded by `owningUploader`, which is what the ownership half reads. */
  itemId: string;
};

/**
 * Seeds one item an uploader owns, and signs in all four kinds beside it.
 *
 * A fresh app per case rather than one shared one, because several of the
 * routes under test write, and a case must not see what the case before it
 * did.
 */
export async function makeMatrixFixture(): Promise<MatrixFixture> {
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const owner = await insertSignedInMember({ database, token: "owner" });
  const actors: Record<ViewerKind, string> = {
    owningUploader: owner.cookie,
    viewer: (
      await insertSignedInMember({
        database,
        token: "viewer",
        member: { role: "viewer" },
      })
    ).cookie,
    otherUploader: (await insertSignedInMember({ database, token: "other" }))
      .cookie,
    admin: (
      await insertSignedInMember({
        database,
        token: "admin",
        member: { role: "admin" },
      })
    ).cookie,
  };
  const itemId = await insertItem(database, { uploadedBy: owner.memberId });
  await insertRendition(database, { itemId });
  return { app, database, close, actors, itemId };
}
