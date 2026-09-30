import { describe, expect, it } from "vitest";
import { readMemberRefs } from "../../src/archive/readMemberRefs.ts";
import { readVisibilitySummaries } from "../../src/archive/readVisibilitySummaries.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertGroup,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readVisibilitySummaries", () => {
  it("reads the seeded everyone rule with no subjects and no label", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    expect(
      (
        await readVisibilitySummaries({
          database,
          ruleIds: [EVERYONE_VISIBILITY_RULE_ID],
        })
      ).get(EVERYONE_VISIBILITY_RULE_ID),
    ).toEqual({
      visibilityRuleId: EVERYONE_VISIBILITY_RULE_ID,
      mode: "everyone",
      label: null,
      subjects: [],
    });

    await database.destroy();
  });

  it("labels an only-one-group rule with that group's name", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const groupId = await insertGroup(database, { name: "Just us two" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      (await readVisibilitySummaries({ database, ruleIds: [ruleId] })).get(
        ruleId,
      ),
    ).toEqual({
      visibilityRuleId: ruleId,
      mode: "only",
      label: "Just us two",
      subjects: [{ kind: "group", id: groupId, displayName: "Just us two" }],
    });

    await database.destroy();
  });

  it("leaves an except rule unlabelled, because the name would invert", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    const summary = (
      await readVisibilitySummaries({ database, ruleIds: [ruleId] })
    ).get(ruleId);
    expect(summary?.label).toBeNull();
    expect(summary?.subjects).toEqual([
      { kind: "group", id: groupId, displayName: "Cousins" },
    ]);

    await database.destroy();
  });

  it("carries member subjects with the display name the product shows", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database, {
      display_name: null,
      email: "abuela@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    const summary = (
      await readVisibilitySummaries({ database, ruleIds: [ruleId] })
    ).get(ruleId);
    expect(summary?.subjects).toEqual([
      { kind: "member", id: memberId, displayName: "abuela" },
    ]);
    expect(summary?.label).toBeNull();

    await database.destroy();
  });
});

describe("readMemberRefs", () => {
  it("reads every member once, falling back to the email local part", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const namedId = await insertMember(database, { display_name: "Lucía" });
    const unnamedId = await insertMember(database, {
      display_name: null,
      email: "papa@example.com",
    });

    const members = await readMemberRefs(database);
    expect(members.get(namedId)).toEqual({
      memberId: namedId,
      displayName: "Lucía",
    });
    expect(members.get(unnamedId)).toEqual({
      memberId: unnamedId,
      displayName: "papa",
    });

    await database.destroy();
  });
});
