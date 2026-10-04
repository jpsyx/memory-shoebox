import { describe, expect, it } from "vitest";
import { createDatabase } from "../../db/client.ts";
import { migrateToLatest } from "../../db/migrate.ts";
import { writeActivityEvent } from "./writeActivityEvent.ts";
import {
  insertMember,
  insertSession,
  NOW,
} from "../../../test/helpers/seedHelpers/seedHelpers.ts";

describe("writeActivityEvent", () => {
  it("denormalises the actor and the device, so the row reads with no join", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database, { display_name: "Papá" });
    const sessionId = await insertSession(database, {
      memberId,
      device_label: "A phone",
    });

    await writeActivityEvent({
      transaction: database,
      viewer: {
        memberId,
        sessionId,
        role: "admin",
        isAdmin: true,
        visibleRuleIds: [],
      },
      kind: "item_deleted",
      subjectKind: "item",
      subjectId: "item-4620",
      subjectLabel: "A photograph from 14 September 2026",
      now: NOW,
    });

    const row = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(row.actor_label).toBe("Papá");
    expect(row.device_label).toBe("A phone");
    expect(row.device_id).toBe(sessionId);
    expect(row.subject_id).toBe("item-4620");
    expect(row.detail_json).toBeNull();
    await database.destroy();
  });

  it("keeps a dangling subject id, because an audit log outlives its subjects", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const sessionId = await insertSession(database, { memberId });

    await writeActivityEvent({
      transaction: database,
      viewer: {
        memberId,
        sessionId,
        role: "admin",
        isAdmin: true,
        visibleRuleIds: [],
      },
      kind: "item_visibility_changed",
      subjectKind: "item",
      subjectId: "an-id-nothing-points-at",
      subjectLabel: "Gone",
      detail: { previousVisibilityRuleId: "visibility-rule-everyone" },
      now: NOW,
    });

    const row = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(row.subject_id).toBe("an-id-nothing-points-at");
    expect(JSON.parse(row.detail_json ?? "{}")).toEqual({
      previousVisibilityRuleId: "visibility-rule-everyone",
    });
    await database.destroy();
  });
});
