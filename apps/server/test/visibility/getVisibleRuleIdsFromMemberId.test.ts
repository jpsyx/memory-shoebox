import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { getVisibleRuleIdsFromMemberId } from "../../src/visibility/getVisibleRuleIdsFromMemberId.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertGroup,
  insertGroupMember,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers.ts";

describe("getVisibleRuleIdsFromMemberId", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it("always includes the seeded everyone rule", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleIds = await getVisibleRuleIdsFromMemberId({ database, memberId });
    expect(ruleIds).toContain(EVERYONE_VISIBILITY_RULE_ID);
  });

  it("includes an only rule that names the member", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("excludes an only rule that names somebody else", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: otherId,
    });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("includes an only rule that names a group the member is in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    await insertGroupMember(database, { groupId, memberId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("excludes an only rule naming a group the member is not in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("excludes an except rule that names the member", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("includes an except rule that names somebody else", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: otherId,
    });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("excludes an except rule naming a group the member is in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    await insertGroupMember(database, { groupId, memberId });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("includes an except rule naming a group the member is not in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("gives an only rule with no subjects to nobody, which fails closed", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });
});
