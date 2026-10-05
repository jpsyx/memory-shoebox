import { expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertRendition,
  insertGroup,
  insertGroupMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertItem,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("membership replacement changes only and except access on the same cookie immediately", async () => {
  const { app, database, close } = await createTestApp();
  const admin = await insertSignedInMember({
    database,
    member: { role: "admin" },
  });
  const viewer = await insertSignedInMember({
    database,
    token: "viewer",
    member: { role: "viewer" },
  });
  const groupId = await insertGroup(database);
  await insertGroupMember(database, { groupId, memberId: viewer.memberId });
  const items = await Promise.all(
    (["only", "except"] as const).map(async (mode, index) => {
      const ruleId = await insertVisibilityRule(database, { mode });
      await insertVisibilityRuleSubject(database, { ruleId, groupId });
      return insertItem(database, {
        uploadedBy: admin.memberId,
        visibility_rule_id: ruleId,
        seq: index,
      });
    }),
  );
  await Promise.all(
    items.map((itemId) => {
      return insertRendition(database, { itemId });
    }),
  );
  const read = (itemId: string) => {
    return app.inject({
      url: `/api/items/${itemId}`,
      headers: { cookie: viewer.cookie },
    });
  };
  expect((await read(items[0]!)).statusCode).toBe(200);
  expect((await read(items[1]!)).statusCode).toBe(404);
  expect(
    (
      await app.inject({
        method: "PUT",
        url: `/api/groups/${groupId}/members`,
        headers: { cookie: admin.cookie },
        payload: { memberIds: [] },
      })
    ).statusCode,
  ).toBe(200);
  expect((await read(items[0]!)).statusCode).toBe(404);
  expect((await read(items[1]!)).statusCode).toBe(200);
  expect(
    (
      await app.inject({
        method: "PUT",
        url: `/api/groups/${groupId}/members`,
        headers: { cookie: admin.cookie },
        payload: { memberIds: [viewer.memberId] },
      })
    ).statusCode,
  ).toBe(200);
  expect((await read(items[0]!)).statusCode).toBe(200);
  expect((await read(items[1]!)).statusCode).toBe(404);
  await close();
});
