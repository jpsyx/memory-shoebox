import type { CreateMilestoneRequest } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMilestone,
  insertItem,
  insertMember,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";

const CREATE_BODY = {
  name: "occasion",
  startsOn: "2026-09-01",
  endsOn: "2026-09-03",
  blurb: null,
} as const satisfies CreateMilestoneRequest;

type AssertMilestoneMutationRoleOptions = {
  app: TestApp["app"];
  cookie: string;
  milestoneId: string;
  itemId: string;
  role: "viewer" | "uploader" | "admin";
};

async function _seedMilestoneRole(
  options: Readonly<{
    database: TestApp["database"];
    role: "viewer" | "uploader" | "admin";
  }>,
): Promise<{
  cookie: string;
  milestoneId: string;
  itemId: string;
}> {
  const { database, role } = options;
  const { cookie, memberId } = await insertSignedInMember({
    database,
    member: { role },
  });
  const milestoneId = await insertMilestone(database, {
    name: "another creator",
    created_by: await insertMember(database),
    startsOn: "2026-09-01",
  });
  const itemId = await insertItem(database, { uploadedBy: memberId });
  return { cookie, milestoneId, itemId };
}

async function _assertMilestoneMutationRole(
  options: Readonly<AssertMilestoneMutationRoleOptions>,
): Promise<void> {
  const { app, cookie, milestoneId, itemId, role } = options;
  const mutations = [
    {
      method: "POST" as const,
      url: "/api/milestones",
      payload: CREATE_BODY,
    },
    {
      method: "PATCH" as const,
      url: `/api/milestones/${milestoneId}`,
      payload: { name: "changed" },
    },
    {
      method: "PATCH" as const,
      url: `/api/milestones/${milestoneId}/items`,
      payload: { attach: [itemId], detach: [] },
    },
    { method: "DELETE" as const, url: `/api/milestones/${milestoneId}` },
  ];
  for (const mutation of mutations) {
    const response = await app.inject({
      ...mutation,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(
      role === "viewer" ? 403 : mutation.method === "POST" ? 201 : 200,
    );
    if (role === "viewer") {
      expect(response.json().error).toBe("milestone_forbidden");
    }
  }
}

async function _assertMilestoneRole(
  role: "viewer" | "uploader" | "admin",
): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, milestoneId, itemId } = await _seedMilestoneRole({
      database,
      role,
    });
    for (const url of ["/api/milestones", `/api/milestones/${milestoneId}`]) {
      expect((await app.inject({ url, headers: { cookie } })).statusCode).toBe(
        200,
      );
    }
    await _assertMilestoneMutationRole({
      app,
      cookie,
      milestoneId,
      itemId,
      role,
    });
  } finally {
    await close();
  }
}

async function _assertUnauthenticatedMilestoneRoutes(
  options: Readonly<{
    app: TestApp["app"];
    milestoneId: string;
  }>,
): Promise<void> {
  const { app, milestoneId } = options;
  for (const request of [
    { method: "GET" as const, url: "/api/milestones" },
    {
      method: "POST" as const,
      url: "/api/milestones",
      payload: CREATE_BODY,
    },
    { method: "GET" as const, url: `/api/milestones/${milestoneId}` },
    {
      method: "PATCH" as const,
      url: `/api/milestones/${milestoneId}`,
      payload: { name: "changed" },
    },
    { method: "DELETE" as const, url: `/api/milestones/${milestoneId}` },
    {
      method: "PATCH" as const,
      url: `/api/milestones/${milestoneId}/items`,
      payload: { attach: [createId()], detach: [] },
    },
  ]) {
    expect((await app.inject(request)).statusCode).toBe(401);
  }
}

async function _assertMilestoneAuthentication(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const milestoneId = createId();
    await _assertUnauthenticatedMilestoneRoutes({ app, milestoneId });
    const { cookie } = await insertSignedInMember({ database });
    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
        ...(method === "PATCH" ? { payload: { name: "changed" } } : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("milestone_not_found");
    }
  } finally {
    await close();
  }
}

async function _assertInvalidMilestoneCursors(
  options: Readonly<{
    app: TestApp["app"];
    cookie: string;
    milestoneId: string;
  }>,
): Promise<void> {
  const { app, cookie, milestoneId } = options;
  for (const cursor of [
    "garbage",
    Buffer.from(
      JSON.stringify({ startsOn: "2026-02-30", milestoneId }),
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ startsOn: "2026-09-01", milestoneId: "bad" }),
    ).toString("base64url"),
  ]) {
    const response = await app.inject({
      url: `/api/milestones?cursor=${cursor}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.cursor).toBeDefined();
  }
}

async function _assertMilestoneValidation(): Promise<void> {
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  try {
    const { cookie, memberId } = await insertSignedInMember({ database });
    const milestoneId = await insertMilestone(database, {
      name: "occasion",
      startsOn: "2026-09-01",
    });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await _assertInvalidMilestoneCursors({ app, cookie, milestoneId });
    for (const payload of [
      { attach: [itemId, itemId], detach: [] },
      { attach: [itemId], detach: [itemId] },
      { attach: [], detach: [] },
      { attach: [], detach: [itemId, itemId] },
    ]) {
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/milestones/${milestoneId}/items`,
            headers: { cookie },
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/milestones",
          headers: { cookie },
          payload: { ...CREATE_BODY, startsOn: "2026-09-04" },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await close();
  }
}

async function _seedMilestoneBatch(database: TestApp["database"]): Promise<{
  cookie: string;
  milestoneId: string;
  itemIds: string[];
}> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "batch",
    startsOn: "2026-09-01",
  });
  const itemIds = await Array.from({ length: 500 }, (_, itemSequence) => {
    return itemSequence;
  }).reduce(async (previousItemInsertions, itemSequence) => {
    const accumulatedItemIds = await previousItemInsertions;
    return [
      ...accumulatedItemIds,
      await insertItem(database, { uploadedBy: memberId, seq: itemSequence }),
    ];
  }, Promise.resolve<string[]>([]));
  return { cookie, milestoneId, itemIds };
}

async function _assertMilestoneBatchLimits(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, milestoneId, itemIds } =
      await _seedMilestoneBatch(database);
    const delta = async (attach: string[], detach: string[]) => {
      return app.inject({
        method: "PATCH",
        url: `/api/milestones/${milestoneId}/items`,
        headers: { cookie },
        payload: { attach, detach },
      });
    };
    expect((await delta(itemIds, [])).json()).toMatchObject({
      attachedCount: 500,
    });
    expect((await delta([], itemIds)).json()).toMatchObject({
      detachedCount: 500,
    });
    const oversized = [...itemIds, createId()];
    expect((await delta(oversized, [])).statusCode).toBe(400);
    expect((await delta([], oversized)).statusCode).toBe(400);
    expect(
      await database.selectFrom("item_milestones").selectAll().execute(),
    ).toEqual([]);
  } finally {
    await close();
  }
}
describe("milestone route boundaries", () => {
  it.each(["viewer", "uploader", "admin"] as const)(
    "uses the %s role ladder regardless of creator",
    _assertMilestoneRole,
  );

  it(
    "requires authentication on every route and returns milestone_not_found",
    _assertMilestoneAuthentication,
  );

  it(
    "rejects malformed cursors, invalid spans, and duplicate or overlapping attachment IDs",
    _assertMilestoneValidation,
  );

  it(
    "accepts 500 per delta direction and rejects 501 without changing attachments",
    _assertMilestoneBatchLimits,
  );
});
