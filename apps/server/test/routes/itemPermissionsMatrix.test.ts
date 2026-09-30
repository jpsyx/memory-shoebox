import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

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
type ViewerKind = "viewer" | "otherUploader" | "owningUploader" | "admin";

/** One mutating route, and what each kind of viewer may do with it. */
type RouteCase = {
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

const ROUTES: readonly RouteCase[] = [
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
const BATCH_EXPECTED: Record<ViewerKind, number> = {
  viewer: 403,
  otherUploader: 200,
  owningUploader: 200,
  admin: 200,
};

describe("who may change an item", () => {
  ROUTES.forEach((route) => {
    (["viewer", "otherUploader", "owningUploader", "admin"] as const).forEach(
      (kind) => {
        it(`${route.name} answers ${route.expected[kind]} for a ${kind}`, async () => {
          const { app, database, close } = await createTestApp({
            clock: () => {
              return new Date(NOW);
            },
          });
          const owner = await insertSignedInMember({
            database,
            token: "owner",
          });
          const actors: Record<ViewerKind, string> = {
            owningUploader: owner.cookie,
            viewer: (
              await insertSignedInMember({
                database,
                token: "viewer",
                member: { role: "viewer" },
              })
            ).cookie,
            otherUploader: (
              await insertSignedInMember({ database, token: "other" })
            ).cookie,
            admin: (
              await insertSignedInMember({
                database,
                token: "admin",
                member: { role: "admin" },
              })
            ).cookie,
          };
          const itemId = await insertItem(database, {
            uploadedBy: owner.memberId,
          });
          await insertRendition(database, { itemId });

          const response = await app.inject({
            method: route.method,
            url: route.path(itemId),
            headers: { cookie: actors[kind] },
            ...(route.payload === undefined ? {} : { payload: route.payload }),
          });

          expect(response.statusCode).toBe(route.expected[kind]);
          await close();
        });
      },
    );
  });

  (["viewer", "otherUploader", "owningUploader", "admin"] as const).forEach(
    (kind) => {
      it(`POST /api/items/visibility answers ${BATCH_EXPECTED[kind]} for a ${kind}`, async () => {
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
          otherUploader: (
            await insertSignedInMember({ database, token: "other" })
          ).cookie,
          admin: (
            await insertSignedInMember({
              database,
              token: "admin",
              member: { role: "admin" },
            })
          ).cookie,
        };
        const itemId = await insertItem(database, {
          uploadedBy: owner.memberId,
        });
        await insertRendition(database, { itemId });

        const response = await app.inject({
          method: "POST",
          url: "/api/items/visibility",
          headers: { cookie: actors[kind] },
          payload: {
            itemIds: [itemId],
            visibilityRuleId: "visibility-rule-everyone",
          },
        });

        expect(response.statusCode).toBe(BATCH_EXPECTED[kind]);
        if (kind === "otherUploader") {
          // Skipped rather than applied: the 200 must not mean it went
          // through. `itemsVisibility.test.ts` holds the write side of this.
          expect(response.json().skippedCount).toBe(1);
        }
        await close();
      });
    },
  );

  it("refuses a viewer the visibility-rule route, which owns nothing", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload: { mode: "everyone", subjects: [] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("visibility_rule_forbidden");
    await close();
  });
});

/**
 * The persona the four columns above cannot express: somebody who uploaded a
 * photograph and was then demoted to `viewer`.
 *
 * They need their own fixture, because every case above is seeded against one
 * item an uploader owns. `conventions.md` § Who may change an item is binding
 * and ends "a viewer may do none of it, which is the one genuine role check on
 * an item": ownership is the second half of the access-changing predicate, not
 * a way round the first. So a demotion takes away the ability to destroy even
 * what they put there themselves, and the role gate runs before the ownership
 * one on all three access-changing routes.
 */
describe("a member demoted to viewer", () => {
  const ROUTES_THEY_OWN: ReadonlyArray<{
    name: string;
    method: "PATCH" | "PUT" | "POST" | "DELETE";
    path: (itemId: string) => string;
    payload?: Record<string, unknown>;
    code: string;
  }> = [
    {
      name: "DELETE /api/items/:itemId",
      method: "DELETE",
      path: (itemId) => {
        return `/api/items/${itemId}`;
      },
      code: "item_delete_forbidden",
    },
    {
      name: "POST /api/items/:itemId/capture-date",
      method: "POST",
      path: (itemId) => {
        return `/api/items/${itemId}/capture-date`;
      },
      payload: { capturedOn: "2026-09-20" },
      code: "item_capture_date_forbidden",
    },
    {
      name: "PATCH /api/items/:itemId/visibility",
      method: "PATCH",
      path: (itemId) => {
        return `/api/items/${itemId}/visibility`;
      },
      payload: { visibilityRuleId: "visibility-rule-everyone" },
      code: "item_visibility_forbidden",
    },
    {
      name: "PATCH /api/items/:itemId",
      method: "PATCH",
      path: (itemId) => {
        return `/api/items/${itemId}`;
      },
      payload: { altText: "Mine, surely" },
      code: "item_edit_forbidden",
    },
  ];

  ROUTES_THEY_OWN.forEach((route) => {
    it(`refuses them ${route.name} on their own photograph`, async () => {
      const { app, database, close } = await createTestApp({
        clock: () => {
          return new Date(NOW);
        },
      });
      const demoted = await insertSignedInMember({
        database,
        token: "demoted",
        member: { role: "viewer" },
      });
      const itemId = await insertItem(database, {
        uploadedBy: demoted.memberId,
      });
      await insertRendition(database, { itemId });

      const response = await app.inject({
        method: route.method,
        url: route.path(itemId),
        headers: { cookie: demoted.cookie },
        ...(route.payload === undefined ? {} : { payload: route.payload }),
      });

      // A 403 and not a 404: they can see it, which is exactly why the
      // refusal tells them nothing they did not already know.
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe(route.code);
      await close();
    });
  });

  it("still lets them comment and react, because opening it is the permission", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const demoted = await insertSignedInMember({
      database,
      token: "demoted",
      member: { role: "viewer" },
    });
    const itemId = await insertItem(database, {
      uploadedBy: demoted.memberId,
    });
    await insertRendition(database, { itemId });

    const comment = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie: demoted.cookie },
      payload: { body: "I can still say something" },
    });
    const reaction = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/reaction`,
      headers: { cookie: demoted.cookie },
      payload: { kind: "love" },
    });

    expect(comment.statusCode).toBe(201);
    expect(reaction.statusCode).toBe(200);
    await close();
  });
});
