import { describe, expect, it } from "vitest";
import { resolveVisibilityRuleResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { insertGroup, NOW } from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("POST /api/visibility-rules/resolve", () => {
  it("finds or creates the rule and answers with its summary", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const groupId = await insertGroup(database, { name: "Cousins" });

    const response = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload: { mode: "only", subjects: [{ kind: "group", id: groupId }] },
    });

    expect(response.statusCode).toBe(200);
    const body = resolveVisibilityRuleResponseSchema.parse(response.json());
    // A single-group `only` rule is labelled with the group's own name, the
    // same composition an item's `visibility.label` carries.
    expect(body.visibility.mode).toBe("only");
    expect(body.visibility.label).toBe("Cousins");
    expect(body.visibility.subjects).toEqual([
      { kind: "group", id: groupId, displayName: "Cousins" },
    ]);
    await close();
  });

  it("finds the same rule a second time rather than creating another", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const groupId = await insertGroup(database, { name: "Cousins" });
    const payload = {
      mode: "only",
      subjects: [{ kind: "group", id: groupId }],
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload,
    });

    expect(first.json().visibilityRuleId).toBe(second.json().visibilityRuleId);
    expect(
      await database.selectFrom("visibility_rules").selectAll().execute(),
    ).toHaveLength(2); // the seeded `everyone` rule, plus this one.
    await close();
  });

  it("refuses a viewer: nothing here is item-scoped, so only the role matters", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload: { mode: "everyone" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("visibility_rule_forbidden");
    await close();
  });

  it("is a 400, never a 404, on an unfinished only-nobody form", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload: { mode: "only", subjects: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    await close();
  });
});
