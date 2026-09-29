import { describe, expect, it } from "vitest";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertVisibilityRule,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

describe("the empty archive and the invisible one", () => {
  it("are byte-identical on the wire", async () => {
    const empty = await makeApp();
    const emptyMember = await insertSignedInMember({
      database: empty.database,
    });
    const emptyResponse = await empty.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: emptyMember.cookie },
    });

    const restricted = await makeApp();
    const restrictedMember = await insertSignedInMember({
      database: restricted.database,
    });
    const otherMemberId = await insertMember(restricted.database);
    const hiddenRuleId = await insertVisibilityRule(restricted.database, {
      mode: "only",
    });
    await insertDrawableItem(restricted.database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    const restrictedResponse = await restricted.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: restrictedMember.cookie },
    });

    expect(restrictedResponse.body).toBe(emptyResponse.body);
    expect(emptyResponse.body).toBe(
      '{"days":[],"nextCursor":null,"resultCount":null}',
    );

    await empty.close();
    await restricted.close();
  });

  it("carries no field beyond the three the shape names", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibilityRuleId: hiddenRuleId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(Object.keys(response.json()).sort()).toEqual([
      "days",
      "nextCursor",
      "resultCount",
    ]);
    await close();
  });
});
