import { describe, expect, it } from "vitest";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/**
 * The persona the matrix's four columns cannot express: somebody who uploaded
 * a photograph and was then demoted to `viewer`.
 *
 * They need their own fixture, and so their own file, because every case in
 * `itemPermissionsMatrix.routes` is seeded against one item an uploader owns. `conventions.md` § Who may change an item is binding
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
