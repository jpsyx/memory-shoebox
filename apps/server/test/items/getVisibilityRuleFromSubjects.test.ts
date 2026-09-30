import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getVisibilityRuleFromSubjects } from "../../src/items/getVisibilityRuleFromSubjects.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertGroup,
  insertMember,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("getVisibilityRuleFromSubjects", () => {
  it("short-circuits everyone to the seeded rule, with no lookup", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const ruleId = await getVisibilityRuleFromSubjects({
      transaction: database,
      mode: "everyone",
      subjects: [],
      now: NOW,
    });

    expect(ruleId).toBe(EVERYONE_VISIBILITY_RULE_ID);
    await database.destroy();
  });

  it("normalises an exception to nobody to the seeded everyone rule", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    expect(
      await getVisibilityRuleFromSubjects({
        transaction: database,
        mode: "except",
        subjects: [],
        now: NOW,
      }),
    ).toBe(EVERYONE_VISIBILITY_RULE_ID);
    await database.destroy();
  });

  it("refuses only-nobody, which is always an unfinished form", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    await expect(
      getVisibilityRuleFromSubjects({
        transaction: database,
        mode: "only",
        subjects: [],
        now: NOW,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await database.destroy();
  });

  it("gives one id to two clients that listed the same people differently", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosaId = await insertMember(database);
    const papaId = await insertMember(database);
    const groupId = await insertGroup(database, { name: "Cousins" });

    const first = await getVisibilityRuleFromSubjects({
      transaction: database,
      mode: "only",
      subjects: [
        { kind: "member", id: rosaId },
        { kind: "group", id: groupId },
        { kind: "member", id: papaId },
      ],
      now: NOW,
    });
    const second = await getVisibilityRuleFromSubjects({
      transaction: database,
      mode: "only",
      subjects: [
        { kind: "member", id: papaId },
        { kind: "member", id: rosaId },
        { kind: "group", id: groupId },
        { kind: "member", id: rosaId },
      ],
      now: NOW,
    });

    expect(second).toBe(first);
    expect(
      await database.selectFrom("visibility_rules").selectAll().execute(),
    ).toHaveLength(2);
    await database.destroy();
  });

  it("stores the subjects once, on the rule it created", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosaId = await insertMember(database);

    const ruleId = await getVisibilityRuleFromSubjects({
      transaction: database,
      mode: "except",
      subjects: [{ kind: "member", id: rosaId }],
      now: NOW,
    });

    const subjects = await database
      .selectFrom("visibility_rule_subjects")
      .selectAll()
      .where("rule_id", "=", ruleId)
      .execute();
    expect(subjects).toHaveLength(1);
    expect(subjects[0]?.member_id).toBe(rosaId);
    expect(subjects[0]?.subject_type).toBe("member");
    await database.destroy();
  });

  it("refuses a subject naming nobody, and a removed member", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const removedId = await insertMember(database, { status: "removed" });

    await expect(
      getVisibilityRuleFromSubjects({
        transaction: database,
        mode: "only",
        subjects: [{ kind: "member", id: createId() }],
        now: NOW,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      getVisibilityRuleFromSubjects({
        transaction: database,
        mode: "only",
        subjects: [{ kind: "member", id: removedId }],
        now: NOW,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await database.destroy();
  });
});
